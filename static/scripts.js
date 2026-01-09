/* 
  VET IAS Bus System - Core Logic 
  Handles Device Binding, GPS Tracking, and QR Scanning
*/

const Utils = {
    // 1. Device Fingerprinting (Simple Version)
    getDeviceId: async () => {
        const components = [
            navigator.userAgent,
            navigator.language,
            screen.colorDepth,
            screen.width + 'x' + screen.height,
            new Date().getTimezoneOffset()
        ];
        const str = components.join('###');

        // Simple Hash Function (SHA-256 would be better in prod)
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return 'DEV-' + Math.abs(hash);
    },

    // 2. Geolocation Wrapper
    getLocation: () => {
        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) {
                reject("Geolocation not supported");
            } else {
                navigator.geolocation.getCurrentPosition(
                    (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
                    (err) => reject(err),
                    { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
                );
            }
        });
    }
};

// Driver Module Logic
const DriverApp = {
    timer: null,

    startTracking: (busNo) => {
        if (DriverApp.timer) return;

        console.log("Starting GPS Tracking for " + busNo);
        showToast("GPS Tracking Started", "success");

        DriverApp.timer = setInterval(async () => {
            try {
                const loc = await Utils.getLocation();
                document.getElementById('status-text').innerText = `Lat: ${loc.lat.toFixed(4)}, Lng: ${loc.lng.toFixed(4)}`;

                // Send to Server
                await fetch('/api/update-location', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ bus_no: busNo, lat: loc.lat, lng: loc.lng })
                });

            } catch (e) {
                console.error("GPS Error", e);
                document.getElementById('status-text').innerText = "GPS Error: " + e.message;
            }
        }, 10000); // Every 10 seconds
    },

    startQRGen: () => {
        setInterval(async () => {
            try {
                const res = await fetch('/api/get-qr');
                const data = await res.json();

                // Clear old QR
                document.getElementById("qrcode").innerHTML = "";

                // Generate New
                new QRCode(document.getElementById("qrcode"), {
                    text: data.qr_data,
                    width: 256,
                    height: 256
                });

                document.getElementById('qr-text').innerText = "Refresh in 10s... Code: " + data.qr_data.split('_')[1];

            } catch (e) { console.error(e); }
        }, 10000); // Refresh QR every 10s
    }
};

// Student Module Logic
const StudentApp = {
    scanner: null,

    startScanner: () => {
        StudentApp.scanner = new Html5Qrcode("qr-reader");

        StudentApp.scanner.start(
            { facingMode: "environment" },
            { fps: 10, qrbox: 250 },
            async (decodedText, decodedResult) => {
                // On Success
                StudentApp.scanner.stop();
                document.getElementById('qr-reader').style.display = 'none';
                showToast("QR Scanned! Verifying...", "success");

                // Get Location for Geofence
                try {
                    const loc = await Utils.getLocation();
                    StudentApp.markAttendance(decodedText, loc);
                } catch (e) {
                    showToast("Location required for attendance!", "error");
                }
            },
            (errorMessage) => {
                // Parsing error, ignore
            }
        ).catch(err => {
            showToast("Camera Error: " + err, "error");
        });
    },

    markAttendance: async (qrData, loc) => {
        const deviceId = await Utils.getDeviceId();
        const res = await fetch('/api/mark-attendance', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                qr_data: qrData,
                lat: loc.lat,
                lng: loc.lng,
                device_id: deviceId
            })
        });

        const data = await res.json();
        if (data.status === 'success') {
            document.getElementById('result-area').innerHTML = `
                <div class="card" style="background: rgba(76, 201, 240, 0.2); border: 1px solid #4cc9f0;">
                    <h3 style="color: #4cc9f0">Attendance Marked!</h3>
                    <p>Bus ID confirmed. Geofence verified.</p>
                </div>
            `;
            showToast(data.message, "success");
            setTimeout(() => location.reload(), 2000);
        } else {
            showToast(data.message, "error");
            document.getElementById('result-area').innerHTML = `
                 <div class="card" style="background: rgba(239, 71, 111, 0.2); border: 1px solid #ef476f;">
                    <h3 style="color: #ef476f">Failed!</h3>
                    <p>${data.message}</p>
                    <button class="btn btn-sm mt-4" onclick="location.reload()">Try Again</button>
                </div>
            `;
        }
    }
};

// Global Toast function
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return; // Silent fail if container doesn't exist
    const d = document.createElement('div');
    d.className = `toast-msg ${type}`;
    d.innerText = message;
    container.appendChild(d);
    setTimeout(() => {
        d.style.opacity = '0';
        setTimeout(() => d.remove(), 300);
    }, 3000);
}
