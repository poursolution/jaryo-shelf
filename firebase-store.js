import { initializeApp } from 'https://www.gstatic.com/firebasejs/13.0.0/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/13.0.0/firebase-auth.js';
import { getFirestore, collection, doc, addDoc, updateDoc, deleteDoc, onSnapshot, getDocsFromServer, runTransaction } from 'https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

// UI controls are intentionally left to the supplied design/Claude handoff.
// No automatic redirect, account creation, import, or seed upload.
let auth, store;
const key = 'jaryo-shelf-file-v1';
function requireUser() {
  const user = auth?.currentUser;
  if (!user) throw new Error('로그인이 필요합니다.');
  return user;
}
function links() {
  const user = requireUser();
  return collection(store, 'users', user.uid, 'links');
}
function checkOwner(uid) {
  if (requireUser().uid !== uid) throw new Error('계정이 변경되었습니다. 다시 시도해 주세요.');
}
function validate(records) {
  if (!Array.isArray(records) || records.length > 2000) throw new Error('자료는 최대 2,000건까지 한 번에 가져올 수 있습니다.');
  const seen = new Set();
  return records.map(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('잘못된 자료 형식입니다.');
    const { id, ...data } = item;
    if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(id) || seen.has(id)) throw new Error('자료 ID가 잘못되었거나 중복되었습니다.');
    seen.add(id);
    let url;
    try { url = new URL(data.url); } catch { throw new Error('자료 주소가 잘못되었습니다.'); }
    if (!['https:', 'http:'].includes(url.protocol)) throw new Error('웹 주소만 가져올 수 있습니다.');
    if (typeof data.title !== 'string' || !['pending','done'].includes(data.status)) throw new Error('자료 제목 또는 상태가 잘못되었습니다.');
    if (new TextEncoder().encode(JSON.stringify(data)).length > 200000) throw new Error('자료 한 건은 200KB 이하여야 합니다.');
    return { id, data };
  });
}
export function initialize() {
  if (!firebaseConfig?.projectId || !firebaseConfig?.apiKey || !firebaseConfig?.authDomain) throw new Error('Firebase 프로젝트 연결 전입니다.');
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  store = getFirestore(app);
  return auth.authStateReady();
}
export const login = () => signInWithPopup(auth, new GoogleAuthProvider());
export const logout = () => signOut(auth);
export const watchAccount = listener => onAuthStateChanged(auth, listener);
export function database() {
  requireUser();
  const owner = auth.currentUser.uid;
  const col = links();
  return { collection(name) {
    if (name !== 'links') throw new Error('지원하지 않는 목록입니다.');
    return {
      async add(data) { checkOwner(owner); return addDoc(col, data); },
      doc(id) {
        const ref = doc(col, id);
        return {
          async update(data) { checkOwner(owner); await updateDoc(ref, data); },
          async delete() { checkOwner(owner); await deleteDoc(ref); }
        };
      },
      onSnapshot(next, fail) {
        checkOwner(owner);
        return onSnapshot(col, { includeMetadataChanges: true }, snapshot => {
          // Never present an optimistic write as server-confirmed data.
          if (!snapshot.metadata.hasPendingWrites && !snapshot.metadata.fromCache && auth.currentUser?.uid === owner) next(snapshot);
        }, fail);
      }
    };
  }};
}
export async function exportBackup() {
  const owner = requireUser().uid;
  const snapshot = await getDocsFromServer(links());
  checkOwner(owner);
  return JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), links: snapshot.docs.map(d => ({ ...d.data(), id: d.id })) }, null, 2);
}
export function localBackup() {
  const raw = localStorage.getItem(key);
  if (!raw) return JSON.stringify({ version: 1, links: [] });
  const data = JSON.parse(raw);
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('브라우저 저장 자료가 잘못되었습니다.');
  return JSON.stringify({ version: 1, links: Object.entries(data).map(([id, value]) => ({ ...value, id })) }, null, 2);
}
export async function importBackup(json) {
  const backup = JSON.parse(json);
  if (backup.version !== 1) throw new Error('지원하지 않는 백업 버전입니다.');
  const records = validate(backup.links);
  const owner = requireUser().uid, col = links();
  let added = 0, skipped = 0;
  for (const item of records) {
    checkOwner(owner);
    const result = await runTransaction(store, async tx => {
      const ref = doc(col, item.id);
      if ((await tx.get(ref)).exists()) return false;
      tx.set(ref, item.data);
      return true;
    });
    if (result) added++; else skipped++;
  }
  // Existing IDs are preserved. A failed import can be resumed safely.
  // Original browser storage is never deleted.
  return { added, skipped };
}

// One transaction per account: repeated visits/devices never resurrect deleted
// initial records. All reads precede all writes, existing IDs are preserved.
export async function importInitial(records) {
  const entries = validate(records);
  if (entries.length > 100) throw new Error('초기 자료는 최대 100건입니다.');
  const owner = requireUser().uid;
  const col = links();
  const marker = doc(store, 'users', owner, 'meta', 'initial-import');
  return runTransaction(store, async tx => {
    checkOwner(owner);
    if ((await tx.get(marker)).exists()) return { added: 0, alreadyImported: true };
    const refs = entries.map(item => doc(col, item.id));
    const existing = [];
    for (const ref of refs) existing.push((await tx.get(ref)).exists());
    let added = 0;
    entries.forEach((item, index) => {
      if (!existing[index]) { tx.set(refs[index], item.data); added++; }
    });
    tx.set(marker, {version: 1, recordCount: entries.length});
    return { added, alreadyImported: false };
  });
}
