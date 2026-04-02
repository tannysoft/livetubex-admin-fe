"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.lineAuth = void 0;
const admin = __importStar(require("firebase-admin"));
const https_1 = require("firebase-functions/v2/https");
const v2_1 = require("firebase-functions/v2");
const https = __importStar(require("https"));
admin.initializeApp();
(0, v2_1.setGlobalOptions)({ region: 'asia-southeast1' });
function fetchLineProfile(accessToken) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'api.line.me',
            path: '/v2/profile',
            method: 'GET',
            headers: { Authorization: `Bearer ${accessToken}` },
        };
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    if (res.statusCode === 200) {
                        resolve(parsed);
                    }
                    else {
                        // LINE API คืน error เช่น token หมดอายุ
                        reject(new https_1.HttpsError('unauthenticated', `LINE API returned ${res.statusCode}: ${parsed.message ?? data}`));
                    }
                }
                catch {
                    reject(new https_1.HttpsError('internal', `Failed to parse LINE response: ${data}`));
                }
            });
        });
        req.on('error', (err) => {
            reject(new https_1.HttpsError('internal', `Network error calling LINE API: ${err.message}`));
        });
        req.setTimeout(10000, () => {
            req.destroy();
            reject(new https_1.HttpsError('deadline-exceeded', 'LINE API request timed out'));
        });
        req.end();
    });
}
exports.lineAuth = (0, https_1.onCall)({
    // CORS: อนุญาต Firebase Hosting domain
    cors: [
        'https://livetubex-admin.web.app',
        'https://livetubex-admin.firebaseapp.com',
        /localhost/,
    ],
}, async (request) => {
    // ── 1. Validate input ──────────────────────────────────────────────────
    const { accessToken } = (request.data ?? {});
    if (!accessToken || typeof accessToken !== 'string' || accessToken.trim() === '') {
        throw new https_1.HttpsError('invalid-argument', 'accessToken is required and must be a non-empty string');
    }
    // ── 2. ยืนยัน LINE Access Token ────────────────────────────────────────
    let lineProfile;
    try {
        lineProfile = await fetchLineProfile(accessToken.trim());
    }
    catch (err) {
        // re-throw HttpsError ที่สร้างใน fetchLineProfile
        if (err instanceof https_1.HttpsError)
            throw err;
        throw new https_1.HttpsError('unauthenticated', 'Failed to verify LINE access token');
    }
    if (!lineProfile.userId) {
        throw new https_1.HttpsError('unauthenticated', 'LINE profile did not return userId');
    }
    // ── 3. ออก Firebase Custom Token ──────────────────────────────────────
    // NOTE: Service Account ต้องมี role "Service Account Token Creator"
    // ไปเพิ่มที่ https://console.cloud.google.com/iam-admin/iam
    let firebaseToken;
    try {
        firebaseToken = await admin.auth().createCustomToken(lineProfile.userId, {
            lineUser: true,
            displayName: lineProfile.displayName,
        });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // ช่วย debug: ถ้า error เกี่ยวกับ IAM จะขึ้น PERMISSION_DENIED
        if (msg.includes('PERMISSION_DENIED') || msg.includes('iam.serviceAccounts.signBlob')) {
            throw new https_1.HttpsError('permission-denied', 'Service account is missing "Service Account Token Creator" role. ' +
                'Go to https://console.cloud.google.com/iam-admin/iam and add the role.');
        }
        throw new https_1.HttpsError('internal', `createCustomToken failed: ${msg}`);
    }
    return {
        firebaseToken,
        lineUserId: lineProfile.userId,
        displayName: lineProfile.displayName,
        pictureUrl: lineProfile.pictureUrl ?? '',
    };
});
//# sourceMappingURL=index.js.map