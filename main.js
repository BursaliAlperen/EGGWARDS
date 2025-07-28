import { getOrCreateUser, saveUserData, fetchUserReferrals } from './firebase.js';
import { initReferralSystem, updateReferralUI } from './ref.js';

const D = document;

// --- DOM Elements ---
const balanceContainerEl = D.getElementById('balance-container');
const balanceAmountEl = D.getElementById('balance-amount');
const eggImageEl = D.getElementById('egg-image');
const progressTextEl = D.getElementById('progress-text');
const progressBarEl = D.getElementById('progress-bar');
const watchAdBtn = D.getElementById('watch-ad-btn');
const walletBtn = D.getElementById('wallet-btn');
const withdrawBtn = D.getElementById('withdraw-btn');
const messageAreaEl = D.getElementById('message-area');
const walletModal = D.getElementById('wallet-modal');
const closeModalBtn = walletModal.querySelector('.close-modal-btn');
const gameScreen = D.getElementById('game-screen');
const referralScreen = D.getElementById('referral-screen');
const navEggBtn = D.getElementById('nav-egg-btn');
const navFriendsBtn = D.getElementById('nav-friends-btn');

// --- Game Constants ---
const CLICKS_TO_CRACK = 20;
const MIN_WITHDRAWAL = 0.02;
const TAP_COOLDOWN = 3000; // 3 seconds cooldown for tapping
const AD_COOLDOWN = 3000; // 3 seconds in milliseconds
const PIPEDREAM_WEBHOOK_URL = 'https://eos5yjgvkh1gbmh.m.pipedream.net';
const EGG_IMAGES = [
    'crystal-egg-0.png',
    'crystal-egg-1.png',
    'crystal-egg-2.png',
    'crystal-egg-3.png',
    'crystal-egg-4.png'
];

// --- Audio ---
let audioContext;
const audioBuffers = {};
let musicSourceNode; // To keep track of the music node

async function setupAudio() {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    await loadSound('tap', 'tap.mp3');
    await loadSound('crack', 'crack.mp3');
    await loadSound('music', 'background-music.mp3');
}

async function loadSound(name, url) {
    try {
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        audioBuffers[name] = audioBuffer;
    } catch (error) {
        console.error(`Error loading sound ${name}:`, error);
    }
}

function playSound(name) {
    if (!audioContext || !audioBuffers[name]) {
        if (audioContext && audioContext.state === 'suspended') {
            audioContext.resume();
        }
        console.warn(`Sound not ready or not found: ${name}`);
        return;
    }
    const source = audioContext.createBufferSource();
    source.buffer = audioBuffers[name];
    source.connect(audioContext.destination);
    source.start(0);
}

function playMusic() {
    if (!audioContext || !audioBuffers['music'] || musicSourceNode) {
        if (audioContext && audioContext.state === 'suspended') {
            audioContext.resume();
        }
        return; // Already playing or not ready
    }
    musicSourceNode = audioContext.createBufferSource();
    musicSourceNode.buffer = audioBuffers['music'];
    musicSourceNode.loop = true;
    musicSourceNode.connect(audioContext.destination);
    musicSourceNode.start(0);
}

// --- Game State ---
let state = {
    userId: null, // To store Firebase doc ID
    progress: 0,
    balance: 0.0,
    walletAddress: null,
    isAdOnCooldown: false,
    isTapOnCooldown: false,
    referrals: [], // To store list of referred users
    telegramUser: {
        id: '123456789', // Placeholder
        username: 'kullanici' // Placeholder, no @
    }
};

// --- Functions ---

function showMessage(text, type = 'info', duration = 3000) {
    messageAreaEl.textContent = text;
    messageAreaEl.className = `message-area ${type}`;
    messageAreaEl.classList.remove('hidden');

    if (duration) {
        setTimeout(() => {
            messageAreaEl.classList.add('hidden');
        }, duration);
    }
}

async function loadState() {
    // 1. Check for referrer in URL
    const urlParams = new URLSearchParams(window.location.search);
    const referrerId = urlParams.get('ref');

    // 2. Mock Telegram User (in a real app, this would come from Telegram)
    // For now, generate a persistent unique ID for the user
    let localUserId = localStorage.getItem('eggwards_local_userid');
    if (!localUserId) {
        localUserId = `local_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        localStorage.setItem('eggwards_local_userid', localUserId);
    }
    state.telegramUser.id = localUserId;
    state.telegramUser.username = `user_${localUserId.slice(6, 10)}`;

    // 3. Get or Create user in Firebase
    try {
        const userData = await getOrCreateUser(state.telegramUser, referrerId);
        if (userData) {
            state.userId = userData.uid;
            state.progress = userData.progress || 0;
            state.balance = userData.balance || 0.0;
            state.walletAddress = userData.walletAddress || null;
            // Fetch referrals
            state.referrals = await fetchUserReferrals(state.userId);
        } else {
             // Fallback to local storage if firebase fails
            const savedState = JSON.parse(localStorage.getItem('eggwards_state'));
            if (savedState) {
                state = { ...state, ...savedState };
            }
        }
    } catch (error) {
        console.error("Error loading state from Firebase:", error);
        showMessage("Could not connect to the server.", "error");
         // Fallback to local storage
        const savedState = JSON.parse(localStorage.getItem('eggwards_state'));
        if (savedState) {
            state = { ...state, ...savedState };
        }
    }
    
    // 4. Update UI
    updateUI();
    initReferralSystem(state);
}

function saveState() {
    // Save to localStorage as a backup
    localStorage.setItem('eggwards_state', JSON.stringify({
        progress: state.progress,
        balance: state.balance,
        walletAddress: state.walletAddress
    }));

    // Save to Firebase
    if (state.userId) {
        const dataToSave = {
            progress: state.progress,
            balance: state.balance,
            walletAddress: state.walletAddress
        };
        saveUserData(state.userId, dataToSave).catch(err => {
            console.error("Failed to save to Firebase:", err);
            showMessage("Failed to save progress to server.", "error");
        });
    }
}

function updateUI() {
    balanceAmountEl.textContent = state.balance.toFixed(4);
    progressTextEl.textContent = `${state.progress}/${CLICKS_TO_CRACK}`;
    progressBarEl.style.width = `${(state.progress / CLICKS_TO_CRACK) * 100}%`;
    updateEggImage();
    // Also update referral UI in case something changed (e.g. balance, etc.)
    updateReferralUI(state);
}

function updateEggImage() {
    let imageIndex;
    if (state.progress >= CLICKS_TO_CRACK) {
        imageIndex = 4;
    } else if (state.progress >= 15) {
        imageIndex = 3;
    } else if (state.progress >= 10) {
        imageIndex = 2;
    } else if (state.progress >= 5) {
        imageIndex = 1;
    } else {
        imageIndex = 0;
    }
    if (eggImageEl.src.includes(EGG_IMAGES[imageIndex]) === false) {
       eggImageEl.src = EGG_IMAGES[imageIndex];
    }
}

function getPrize() {
    const rand = Math.random() * 100;
    if (rand < 0.001) return 0.01;   // 0.001%
    if (rand < 0.99) return 0.005;  // 0.99% - 0.001%
    if (rand < 10) return 0.002;      // 10% - 0.99%
    return 0.001;                   // 89%
}

function crackTheEgg() {
    eggImageEl.src = EGG_IMAGES[4]; // Broken egg image
    playSound('crack');
    const prize = getPrize();
    state.balance += prize;
    state.progress = 0;

    showMessage(`Tebrikler! Yumurtan kırıldı! 🎊`, 'success', 5000);
    setTimeout(() => {
        showMessage(`Kazandığın ödül: ${prize.toFixed(4)} TON 💸`, 'success', 5000);
    }, 2000);
     setTimeout(() => {
        showMessage(`Cüzdanına eklenmiştir.`, 'info', 5000);
    }, 4000);


    saveState();
    setTimeout(() => {
        updateUI();
        // Reset egg image after a delay to start over
        setTimeout(() => {
            eggImageEl.src = EGG_IMAGES[0];
        }, 1500);
    }, 100); 
}

async function handleWatchAd() {
    if (state.isAdOnCooldown) {
        showMessage('Çok hızlısın! Lütfen biraz bekle. 🐌', 'warning');
        return;
    }

    state.isAdOnCooldown = true;
    watchAdBtn.disabled = true;

    showMessage('Reklam izleniyor... 🍿', 'info', 4000);
    playSound('tap'); // Play a sound on action start

    // Simulate ad watching
    const adDuration = Math.random() * 2000 + 3000; // 3-5 seconds
    
    setTimeout(() => {
        state.progress++;
        
        saveState();
        updateUI();

        if (state.progress >= CLICKS_TO_CRACK) {
             setTimeout(crackTheEgg, 500);
        } else {
            showMessage(`+1 ilerleme! (${state.progress}/${CLICKS_TO_CRACK})`, 'info');
        }
        
        // Cooldown timer text
        let countdown = AD_COOLDOWN / 1000;
        watchAdBtn.textContent = `${countdown}s`;
        const interval = setInterval(() => {
            countdown--;
            if(countdown > 0) {
                watchAdBtn.textContent = `${countdown}s`;
            } else {
                clearInterval(interval);
            }
        }, 1000);


        // Cooldown
        setTimeout(() => {
            state.isAdOnCooldown = false;
            watchAdBtn.disabled = false;
            watchAdBtn.innerHTML = `<span class="btn-icon">▶️</span> Reklam İzle`;
        }, AD_COOLDOWN);

    }, adDuration);
}

async function handleEggTap() {
    // This function is currently not used as egg tapping is disabled.
    // Kept for potential future use.
    if (state.isTapOnCooldown) {
        showMessage('Çok hızlısın! Lütfen biraz bekle. 🐌', 'warning', 1500);
        return;
    }

    playSound('tap');
    eggImageEl.classList.add('tapped');
    setTimeout(() => eggImageEl.classList.remove('tapped'), 200);


    state.isTapOnCooldown = true;
    
    // Visual progress update happens immediately
    state.progress++;
    if (state.progress >= CLICKS_TO_CRACK) {
        updateUI(); // show 20/20
        setTimeout(crackTheEgg, 500); // slight delay before cracking animation
    } else {
       showMessage(`+1 ilerleme! (${state.progress}/${CLICKS_TO_CRACK})`, 'info', 2000);
       updateUI();
    }
    
    saveState();

    // Cooldown
    setTimeout(() => {
        state.isTapOnCooldown = false;
    }, TAP_COOLDOWN);
}

function handleSetWallet() {
    const address = prompt('Lütfen Ton Wallet adresini yazınız (örnek: EQC...):', state.walletAddress || '');
    if (address && address.trim().length > 10) { // Basic validation
        state.walletAddress = address.trim();
        saveState();
        showMessage('Cüzdanınız kaydedildi ✅', 'success');
        closeModal();
    } else if (address !== null) { // User didn't cancel but entered invalid
        showMessage('Geçersiz cüzdan adresi. ❌', 'error');
    }
}

async function handleWithdraw() {
    if (state.balance < MIN_WITHDRAWAL) {
        showMessage(`Bakiyeniz yetersiz. Minimum çekim limiti ${MIN_WITHDRAWAL} TON ⛔`, 'error');
        return;
    }

    if (!state.walletAddress) {
        showMessage('Lütfen önce Ton cüzdan adresinizi kaydedin. 💼', 'warning');
        handleSetWallet();
        return;
    }

    closeModal();
    const amountToWithdraw = state.balance;
    showMessage('Çekim talebi gönderiliyor... ⏳', 'info', null);
    
    const payload = {
      user_id: state.telegramUser.id,
      username: state.telegramUser.username,
      wallet: state.walletAddress,
      amount: amountToWithdraw,
      request_time: new Date().toISOString()
    };

    try {
        const response = await fetch(PIPEDREAM_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            showMessage('Çekim isteğiniz alındı. Onay süreci başladı. ✅', 'success');
            state.balance = 0;
            saveState();
            updateUI();
        } else {
            throw new Error('Webhook request failed');
        }
    } catch (error) {
        console.error('Withdrawal Error:', error);
        showMessage('Çekim talebi gönderilemedi. Lütfen tekrar deneyin. ❌', 'error');
    }
}

// --- Modal Functions ---
function openModal() {
    walletModal.classList.remove('hidden');
}

function closeModal() {
    walletModal.classList.add('hidden');
}

// --- Navigation ---
function navigateTo(screen) {
    if (screen === 'friends') {
        gameScreen.classList.add('hidden');
        referralScreen.classList.remove('hidden');
        navFriendsBtn.classList.add('active');
        navEggBtn.classList.remove('active');
        updateReferralUI(state); // Ensure UI is fresh
    } else { // 'egg' or default
        gameScreen.classList.remove('hidden');
        referralScreen.classList.add('hidden');
        navEggBtn.classList.add('active');
        navFriendsBtn.classList.remove('active');
    }
}

// --- Event Listeners ---
watchAdBtn.addEventListener('click', handleWatchAd);
walletBtn.addEventListener('click', handleSetWallet);
withdrawBtn.addEventListener('click', handleWithdraw);
balanceContainerEl.addEventListener('click', openModal);
closeModalBtn.addEventListener('click', closeModal);
walletModal.addEventListener('click', (e) => {
    if (e.target === walletModal) {
        closeModal();
    }
});
navEggBtn.addEventListener('click', () => navigateTo('egg'));
navFriendsBtn.addEventListener('click', () => navigateTo('friends'));

D.addEventListener('DOMContentLoaded', () => {
    // Check URL to see which page to show initially
    const urlParams = new URLSearchParams(window.location.search);
    const page = urlParams.get('page');
    if (page === 'friends') {
        navigateTo('friends');
    }

    loadState();
    // User interaction is needed to start audio context
    const startAudio = () => {
        setupAudio().then(() => {
            playMusic();
            D.body.removeEventListener('click', startAudio);
            D.body.removeEventListener('touchend', startAudio);
        });
    };
    D.body.addEventListener('click', startAudio);
    D.body.addEventListener('touchend', startAudio);
});