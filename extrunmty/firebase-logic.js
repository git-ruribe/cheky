// firebase-logic.js

// 1. INICIALIZACIÓN DE FIREBASE
// Obten esto de tu consola de Firebase: Configuración del proyecto > General > Tus apps > Configuración de SDK
const firebaseConfig = {
  apiKey: "AIzaSyAeimFiXVtxCMJXS8jnSMkzczSEU_r-1ag",
  authDomain: "first5k.firebaseapp.com",
  databaseURL: "https://first5k-default-rtdb.firebaseio.com",
  projectId: "first5k",
  storageBucket: "first5k.appspot.com",
  messagingSenderId: "812715743859",
  appId: "1:812715743859:web:11c55c3cc0b23c9ed12806"
};

// Inicializar Firebase
const app = firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.database();
const storage = firebase.storage();

// ===============================================
// FUNCIONES DE AUTENTICACIÓN
// ===============================================

/**
 * Registra un nuevo usuario con email, contraseña y nombre.
 * @param {string} email
 * @param {string} password
 * @param {string} name
 * @returns {Promise<firebase.auth.UserCredential>}
 */
async function signUp(email, password, name) {
  const userCredential = await auth.createUserWithEmailAndPassword(email, password);
  await userCredential.user.updateProfile({ displayName: name });
  // Guarda el nombre en la Realtime Database también, para consistencia.
  await db.ref(`users/${userCredential.user.uid}/profile`).set({ name: name });
  return userCredential;
}

/**
 * Inicia sesión de un usuario.
 * @param {string} email
 * @param {string} password
 * @returns {Promise<firebase.auth.UserCredential>}
 */
function signIn(email, password) {
  return auth.signInWithEmailAndPassword(email, password);
}

/**
 * Cierra la sesión del usuario actual.
 */
function signOutUser() {
  return auth.signOut();
}

/**
 * Observador del estado de autenticación.
 * Ejecuta callbacks para cuando el usuario inicia sesión o no hay sesión.
 * @param {function} onUserLoggedIn - Callback si el usuario está logueado.
 * @param {function} onUserLoggedOut - Callback si no hay usuario.
 */
function onAuthStateChangedHandler(onUserLoggedIn, onUserLoggedOut) {
  auth.onAuthStateChanged(user => {
    if (user) {
      onUserLoggedIn(user);
    } else {
      onUserLoggedOut();
    }
  });
}

// ===============================================
// FUNCIONES DE REALTIME DATABASE
// ===============================================

/**
 * Guarda o actualiza los datos del perfil de un usuario.
 * @param {string} userId - El UID del usuario.
 * @param {object} profileData - Objeto con datos del perfil (ej. { name: 'Juan', photoURL: '...' }).
 */
function saveUserProfileData(userId, profileData) {
    const profileRef = db.ref(`users/${userId}/profile`);
    return profileRef.update(profileData);
}

/**
 * Obtiene los datos del perfil de un usuario.
 * @param {string} userId
 * @returns {Promise<object>}
 */
async function getUserProfileData(userId) {
    const snapshot = await db.ref(`users/${userId}/profile`).once('value');
    return snapshot.val() || {};
}


/**
 * Guarda los datos de participación de una carrera para un usuario.
 * @param {string} userId
 * @param {string} raceName - Nombre de la carrera.
 * @param {object} data - Objeto con { photoURL, distance, time, timestamp }.
 */
function saveRaceData(userId, raceName, data) {
  const sanitizedRaceName = raceName.replace(/[.#$[\]]/g, '_'); // Firebase no permite ciertos caracteres en las claves.
  return db.ref(`users/${userId}/races/${sanitizedRaceName}`).set(data);
}

/**
 * Obtiene todos los datos de las carreras de un usuario.
 * @param {string} userId
 * @returns {Promise<object|null>} - Un objeto donde las claves son los nombres de las carreras.
 */
async function getAllUserRaces(userId) {
  const snapshot = await db.ref(`users/${userId}/races`).once('value');
  return snapshot.val();
}

/**
 * Elimina la participación de una carrera para un usuario.
 * @param {string} userId
 * @param {string} raceName
 */
function deleteRaceData(userId, raceName) {
    const sanitizedRaceName = raceName.replace(/[.#$[\]]/g, '_');
    return db.ref(`users/${userId}/races/${sanitizedRaceName}`).remove();
}


// ===============================================
// FUNCIONES DE FIREBASE STORAGE
// ===============================================

/**
 * Convierte un string base64 a un Blob para poder subirlo.
 * @param {string} base64
 * @param {string} contentType
 * @returns {Blob}
 */
function base64ToBlob(base64, contentType = 'image/jpeg') {
    const byteCharacters = atob(base64.split(',')[1]);
    const byteArrays = [];
    for (let offset = 0; offset < byteCharacters.length; offset += 512) {
        const slice = byteCharacters.slice(offset, offset + 512);
        const byteNumbers = new Array(slice.length);
        for (let i = 0; i < slice.length; i++) {
            byteNumbers[i] = slice.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        byteArrays.push(byteArray);
    }
    return new Blob(byteArrays, { type: contentType });
}


/**
 * Sube una imagen a Firebase Storage y devuelve la URL de descarga.
 * @param {string} userId
 * @param {string} raceName
 * @param {Blob} fileBlob - El archivo de imagen como Blob.
 * @returns {Promise<string>} - La URL de descarga de la imagen.
 */
async function uploadImageAndGetURL(userId, path, fileBlob) {
    const sanitizedPath = path.replace(/[.#$[\]]/g, '_');
    const storageRef = storage.ref(`users/${userId}/${sanitizedPath}.jpg`);
    const snapshot = await storageRef.put(fileBlob);
    return snapshot.ref.getDownloadURL();
}

/**
 * Borra un archivo de Firebase Storage a partir de su URL de descarga.
 * @param {string} url - La URL https://firebasestorage.googleapis.com/... del archivo a borrar.
 * @returns {Promise<void>}
 */
function deleteImageFromURL(url) {
    // Si la URL no es de Firebase Storage, no hagas nada
    if (!url || !url.includes('firebasestorage.googleapis.com')) {
        return Promise.resolve();
    }
    // Creamos una referencia al archivo desde la URL y lo borramos
    return storage.refFromURL(url).delete();
}

/**
 * Crea una publicación en el muro comunitario público.
 * @param {object} postData - Objeto con { userUid, userName, raceName, photoURL }.
 */
function createPublicPost(postData) {
  const newPostRef = db.ref('public_posts').push();
  const newPostKey = newPostRef.key; // Obtenemos la ID única
  return newPostRef.set({
    ...postData,
    timestamp: firebase.database.ServerValue.TIMESTAMP
  }).then(() => newPostKey); // Devolvemos la ID cuando la escritura termina
}

function deletePublicPost(postKey) {
    if (!postKey) return Promise.resolve();
    return db.ref(`public_posts/${postKey}`).remove();
}