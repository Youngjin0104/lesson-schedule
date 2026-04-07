// firebase-config.js  ─ ES Module
// ⚠️  firebaseConfig 값을 본인의 Firebase 프로젝트 설정으로 교체하세요

import { initializeApp }                          from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword,
         signOut, onAuthStateChanged,
         sendPasswordResetEmail }             from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, collection, doc, getDocs,
         getDoc, setDoc, addDoc, updateDoc,
         deleteDoc, onSnapshot, query,
         orderBy, serverTimestamp }                from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ─────────────────────────────────────────────
//  🔧 여기만 교체하세요
// ─────────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyAOU7qLINaGItX-SeyQumHOskHxOrL-nvk",
  authDomain: "lesson-schedule-a14a3.firebaseapp.com",
  projectId: "lesson-schedule-a14a3",
  storageBucket: "lesson-schedule-a14a3.firebasestorage.app",
  messagingSenderId: "862889457808",
  appId: "1:862889457808:web:65a9920bceb0ecfb374015"
};
// ─────────────────────────────────────────────

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

// ── AUTH ──────────────────────────────────────
export const fbSignIn      = (email, pw) => signInWithEmailAndPassword(auth, email, pw);
export const fbSignOut     = ()          => signOut(auth);
export const fbOnAuth      = (cb)        => onAuthStateChanged(auth, cb);
export const fbCurrentUser = ()          => auth.currentUser;
export const fbSendPasswordReset = (email) => sendPasswordResetEmail(auth, email);

// ── USERS ─────────────────────────────────────
export const fbGetUser  = async (uid) => {
  const d = await getDoc(doc(db, 'users', uid));
  return d.exists() ? { id: d.id, ...d.data() } : null;
};
export const fbGetUsers = async () => {
  const s = await getDocs(collection(db, 'users'));
  return s.docs.map(d => ({ id: d.id, ...d.data() }));
};
export const fbSetUser    = (uid, data) => setDoc(doc(db, 'users', uid), data, { merge: true });
export const fbDeleteUser = (uid)       => deleteDoc(doc(db, 'users', uid));
export const fbWatchUsers = (cb)        =>
  onSnapshot(collection(db, 'users'), s =>
    cb(s.docs.map(d => ({ id: d.id, ...d.data() }))));

// ── STUDENTS ──────────────────────────────────
export const fbGetStudents   = async () => {
  const s = await getDocs(query(collection(db, 'students'), orderBy('name')));
  return s.docs.map(d => ({ id: d.id, ...d.data() }));
};
export const fbAddStudent    = (data)      => addDoc(collection(db, 'students'), { ...data, createdAt: serverTimestamp() });
export const fbUpdateStudent = (id, data)  => updateDoc(doc(db, 'students', id), data);
export const fbDeleteStudent = (id)        => deleteDoc(doc(db, 'students', id));
export const fbWatchStudents = (cb)        =>
  onSnapshot(query(collection(db, 'students'), orderBy('name')), s =>
    cb(s.docs.map(d => ({ id: d.id, ...d.data() }))));

// ── LESSONS ───────────────────────────────────
export const fbGetLessons   = async () => {
  const s = await getDocs(collection(db, 'lessons'));
  return s.docs.map(d => ({ id: d.id, ...d.data() }));
};
export const fbAddLesson    = (data)     => addDoc(collection(db, 'lessons'), { ...data, createdAt: serverTimestamp() });
export const fbUpdateLesson = (id, data) => updateDoc(doc(db, 'lessons', id), data);
export const fbDeleteLesson = (id)       => deleteDoc(doc(db, 'lessons', id));
export const fbWatchLessons = (cb)       =>
  onSnapshot(collection(db, 'lessons'), s =>
    cb(s.docs.map(d => ({ id: d.id, ...d.data() }))));
