// firebase-config.js
// ⚠️  여기에 Firebase 프로젝트 설정을 입력하세요
// Firebase Console → 프로젝트 설정 → 내 앱 → SDK 설정에서 복사

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, collection, doc, getDocs, getDoc, setDoc, addDoc,
  updateDoc, deleteDoc, onSnapshot, query, orderBy, where, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getMessaging, getToken, onMessage }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging.js";

// ============================================================
// 🔧 아래 firebaseConfig를 본인의 Firebase 설정으로 교체하세요
// ============================================================
const firebaseConfig = {
    apiKey: "AIzaSyAOU7qLINaGItX-SeyQumHOskHxOrL-nvk",
    authDomain: "lesson-schedule-a14a3.firebaseapp.com",
    projectId: "lesson-schedule-a14a3",
    storageBucket: "lesson-schedule-a14a3.firebasestorage.app",
    messagingSenderId: "862889457808",
    appId: "1:862889457808:web:65a9920bceb0ecfb374015"
  };

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

// ============================================================
// AUTH
// ============================================================
window.fbAuth = auth;
window.fbDB   = db;

window.fbSignIn = (email, password) =>
  signInWithEmailAndPassword(auth, email, password);

window.fbSignOut = () => signOut(auth);

window.fbOnAuth = (cb) => onAuthStateChanged(auth, cb);

// ============================================================
// FIRESTORE HELPERS
// ============================================================

// --- USERS (선생님 프로필) ---
window.fbGetUsers = async () => {
  const snap = await getDocs(collection(db, 'users'));
  return snap.docs.map(d => ({id: d.id, ...d.data()}));
};
window.fbGetUser = async (uid) => {
  const d = await getDoc(doc(db, 'users', uid));
  return d.exists() ? {id: d.id, ...d.data()} : null;
};
window.fbSetUser = (uid, data) =>
  setDoc(doc(db, 'users', uid), data, {merge: true});
window.fbDeleteUser = (uid) =>
  deleteDoc(doc(db, 'users', uid));
window.fbWatchUsers = (cb) =>
  onSnapshot(collection(db, 'users'), snap =>
    cb(snap.docs.map(d => ({id: d.id, ...d.data()}))));

// --- STUDENTS ---
window.fbGetStudents = async () => {
  const snap = await getDocs(query(collection(db, 'students'), orderBy('name')));
  return snap.docs.map(d => ({id: d.id, ...d.data()}));
};
window.fbAddStudent = (data) =>
  addDoc(collection(db, 'students'), {...data, createdAt: serverTimestamp()});
window.fbUpdateStudent = (id, data) =>
  updateDoc(doc(db, 'students', id), data);
window.fbDeleteStudent = (id) =>
  deleteDoc(doc(db, 'students', id));
window.fbWatchStudents = (cb) =>
  onSnapshot(query(collection(db, 'students'), orderBy('name')), snap =>
    cb(snap.docs.map(d => ({id: d.id, ...d.data()}))));

// --- LESSONS ---
window.fbGetLessons = async () => {
  const snap = await getDocs(collection(db, 'lessons'));
  return snap.docs.map(d => ({id: d.id, ...d.data()}));
};
window.fbAddLesson = (data) =>
  addDoc(collection(db, 'lessons'), {...data, createdAt: serverTimestamp()});
window.fbUpdateLesson = (id, data) =>
  updateDoc(doc(db, 'lessons', id), data);
window.fbDeleteLesson = (id) =>
  deleteDoc(doc(db, 'lessons', id));
window.fbWatchLessons = (cb) =>
  onSnapshot(collection(db, 'lessons'), snap =>
    cb(snap.docs.map(d => ({id: d.id, ...d.data()}))));

// ============================================================
// PUSH NOTIFICATIONS (FCM) — Android 완벽지원, iOS 16.4+
// ============================================================
window.fbInitMessaging = async () => {
  try {
    const messaging = getMessaging(app);
    // VAPID key는 Firebase Console → 클라우드 메시징 → 웹 푸시 인증서에서 복사
    const VAPID_KEY = "YOUR_VAPID_KEY";
    const token = await getToken(messaging, { vapidKey: VAPID_KEY });
    if (token) {
      console.log('FCM Token:', token);
      // 현재 유저 doc에 토큰 저장
      const uid = auth.currentUser?.uid;
      if (uid) await fbSetUser(uid, { fcmToken: token });
    }
    onMessage(messaging, (payload) => {
      showToast('🔔 ' + (payload.notification?.title || '새 알림'));
    });
  } catch(e) {
    console.warn('FCM init failed:', e.message);
  }
};

export { auth, db };
