// Firebase SDK imports
import { initializeApp } from "firebase/app";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  increment,
  serverTimestamp,
  collection,
  query,
  where,
  getDocs,
} from "firebase/firestore";

/* @tweakable Your Firebase project configuration */
const firebaseConfig = {
  apiKey: "API_KEY",
  authDomain: "PROJECT.firebaseapp.com",
  projectId: "PROJECT_ID",
  storageBucket: "PROJECT.appspot.com",
  messagingSenderId: "SENDER_ID",
  appId: "APP_ID",
};

// Initialize Firebase
let app;
let db;
try {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
} catch (e) {
    console.error("Firebase initialization failed. Using mock mode.", e);
    // App will fallback to localStorage automatically
}


/**
 * Updates the stats for a referrer user.
 * @param {string} referrerId The Firestore document ID of the referring user.
 */
async function updateReferrerStats(referrerId) {
    if (!db) return;
    const referrerRef = doc(db, "users", referrerId);

    // Check if referrer exists before trying to update
    const referrerSnap = await getDoc(referrerRef);
    if (!referrerSnap.exists()) {
        console.warn(`Referrer with ID ${referrerId} not found.`);
        return;
    }

    /* @tweakable Amount of TON coin awarded to the referrer for each new user. */
    const tonPerReferral = 0.005;
    
    await updateDoc(referrerRef, {
        refCount: increment(1),
        // You can add points or other bonuses here
        balance: increment(tonPerReferral), 
    });
}


/**
 * Gets a user from Firestore by their Telegram ID, or creates a new one if not found.
 * @param {object} tgUser - The user object from Telegram.
 * @param {string|null} referrerId - The Firestore UID of the user who referred them.
 * @returns {Promise<object|null>} The user's data from Firestore or null on error.
 */
export async function getOrCreateUser(tgUser, referrerId = null) {
    if (!db) return null;
    const userRef = doc(db, "users", tgUser.id);
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
        // User exists, return their data
        return { uid: userSnap.id, ...userSnap.data() };
    } else {
        // User does not exist, create them
        try {
            const newUser = {
                uid: tgUser.id,
                telegramId: tgUser.id,
                username: tgUser.username,
                referrerId: referrerId || null,
                refCount: 0,
                balance: 0,
                progress: 0,
                walletAddress: null,
                createdAt: serverTimestamp(),
            };
            await setDoc(userRef, newUser);

            // If there was a referrer, update their stats
            if (referrerId) {
                await updateReferrerStats(referrerId);
            }
            console.log("New user created in Firestore:", tgUser.id);
            return newUser;
        } catch (error) {
            console.error("Error creating user in Firestore:", error);
            return null;
        }
    }
}

/**
 * Saves user game data to their Firestore document.
 * @param {string} userId The user's Firestore document ID.
 * @param {object} data The data object to save (e.g., { progress, balance }).
 */
export async function saveUserData(userId, data) {
    if (!db) return;
    const userRef = doc(db, "users", userId);
    await updateDoc(userRef, data);
}

/**
 * Fetches all users who were referred by the given userId.
 * @param {string} userId The Firestore document ID of the referrer.
 * @returns {Promise<Array<object>>} A list of referred user objects.
 */
export async function fetchUserReferrals(userId) {
    if (!db) return [];
    try {
        const usersRef = collection(db, "users");
        const q = query(usersRef, where("referrerId", "==", userId));
        const querySnapshot = await getDocs(q);
        const referrals = [];
        querySnapshot.forEach((doc) => {
            referrals.push({ uid: doc.id, ...doc.data() });
        });
        return referrals;
    } catch (error) {
        console.error("Error fetching referrals:", error);
        return [];
    }
}