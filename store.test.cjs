const fs = require('node:fs');
const assert = require('node:assert/strict');
const source = fs.readFileSync(__dirname + '/firebase-store.js', 'utf8')
  .replace(/^import .*;$/gm, '').replace(/export /g, '');
const auth = { currentUser: { uid: 'alice' }, authStateReady: async () => {} };
const rows = new Map();
let listener;
const api = {
  initializeApp: () => ({}), getAuth: () => auth, getFirestore: () => ({}),
  collection: (_, ...parts) => parts.join('/'), doc: (col, ...parts) => (typeof col === 'string' ? col+'/' : '') + parts.join('/'),
  addDoc: async (col, data) => { rows.set(col + '/new', data); return {id:'new'}; },
  updateDoc: async (id, data) => rows.set(id, {...rows.get(id), ...data}),
  deleteDoc: async id => rows.delete(id),
  onSnapshot: (col, options, next) => { listener = next; return () => {}; },
  getDocsFromServer: async col => ({docs: [...rows].filter(([id]) => id.startsWith(col + '/')).map(([id, data]) => ({id: id.split('/').pop(), data: () => data}))}),
  runTransaction: async (_, run) => run({get: async id => ({exists: () => rows.has(id)}), set: (id, data) => rows.set(id, data)}),
  GoogleAuthProvider: class {}, signInWithPopup: async () => ({}), signOut: async () => {auth.currentUser = null;},
  onAuthStateChanged: (_, next) => { next(auth.currentUser); return () => {}; },
  firebaseConfig: {projectId:'test',apiKey:'test',authDomain:'test'},
  localStorage: {getItem: () => null}
};
const store = new Function(...Object.keys(api), source + ';return {initialize,database,importBackup,importInitial,exportBackup,logout};')(...Object.values(api));
const entry = {id:'original',title:'자료',url:'https://example.com',status:'done',summary:'보존',fav:true};
(async () => {
 await store.initialize();
 assert.deepEqual(await store.importBackup(JSON.stringify({version:1,links:[entry]})), {added:1,skipped:0});
 assert.deepEqual(await store.importBackup(JSON.stringify({version:1,links:[{...entry,title:'덮어쓰기 금지'}]})), {added:0,skipped:1});
 assert.equal(JSON.parse(await store.exportBackup()).links[0].title, '자료');
 assert.deepEqual(await store.importInitial([entry]), {added:0,alreadyImported:false});
 rows.delete('users/alice/links/original');
 assert.deepEqual(await store.importInitial([entry]), {added:0,alreadyImported:true});
 assert.equal(rows.has('users/alice/links/original'), false, 'deleted initial records must not reappear');
 await assert.rejects(store.importBackup(JSON.stringify({version:1,links:[{...entry,url:'javascript:alert(1)'}]})));
 await assert.rejects(store.importBackup(JSON.stringify({version:1,links:[entry,entry]})));
 const col = store.database().collection('links');
 let count = 0;
 col.onSnapshot(() => count++);
 listener({metadata:{hasPendingWrites:true,fromCache:false}});
 listener({metadata:{hasPendingWrites:false,fromCache:true}});
 assert.equal(count,0);
 listener({metadata:{hasPendingWrites:false,fromCache:false}});
 assert.equal(count,1);
 auth.currentUser = {uid:'bob'};
 listener({metadata:{hasPendingWrites:false,fromCache:false}});
 assert.equal(count,1);
 await assert.rejects(col.doc('original').update({title:'다른 계정 변경'}));
 assert.equal(JSON.parse(await store.exportBackup()).links.length,0);
 await store.logout();
 assert.throws(() => store.database());
 console.log('PASS: import ID preservation, duplicate skip, invalid input rejection, server snapshot filtering, account isolation and logout.');
 console.log('Mock-based unit checks only; Firebase emulator/live authorization still require verification.');
})().catch(error => { console.error(error); process.exitCode = 1; });
