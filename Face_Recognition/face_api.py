import os
import io
import re
import time
import base64
import pickle
import threading
import datetime
from PIL import Image
import numpy as np
import face_recognition
from flask import Flask, request, jsonify

app = Flask(__name__)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_DIR = os.path.join(BASE_DIR, 'db')
CACHE_FILE = os.path.join(BASE_DIR, 'encodings_cache.pkl')
LOG_FILE = os.path.join(BASE_DIR, 'attendance_log.csv')
SECRET_KEY = "Indra Arrow"
TOLERANCE = 0.55  # Match threshold (lower = stricter, 0.55 is balanced & accurate)

os.makedirs(DB_DIR, exist_ok=True)

# In-memory face database & thread safety
db_lock = threading.Lock()
known_encodings = []  # List of 128-d numpy arrays
known_names = []      # List of usernames
cache_mtimes = {}     # Dict of filename -> mtime


def decode_image_from_base64(b64_string):
    """Decodes a base64 string directly into an RGB numpy array (in-memory)."""
    if ',' in b64_string:
        b64_string = b64_string.split(',', 1)[1]
    img_bytes = base64.b64decode(b64_string)
    pil_img = Image.open(io.BytesIO(img_bytes)).convert('RGB')
    
    # Resize large images down to max dimension 800px for speed and low memory
    max_dim = 800
    if max(pil_img.size) > max_dim:
        pil_img.thumbnail((max_dim, max_dim), Image.Resampling.LANCZOS)
        
    return np.array(pil_img)


def sync_encodings():
    """Syncs in-memory encodings with DB_DIR and persistent cache file."""
    global known_encodings, known_names, cache_mtimes
    with db_lock:
        loaded_from_disk = False
        if os.path.exists(CACHE_FILE):
            try:
                with open(CACHE_FILE, 'rb') as f:
                    cache_data = pickle.load(f)
                    known_encodings = cache_data.get('encodings', [])
                    known_names = cache_data.get('names', [])
                    cache_mtimes = cache_data.get('mtimes', {})
                    loaded_from_disk = True
            except Exception as e:
                print(f"[FaceAPI] Warning: Could not read cache file ({e}). Rebuilding...")
                known_encodings, known_names, cache_mtimes = [], [], {}

        # Scan current files in DB_DIR
        valid_exts = ('.jpg', '.jpeg', '.png')
        current_files = {
            f: os.path.getmtime(os.path.join(DB_DIR, f))
            for f in os.listdir(DB_DIR)
            if f.lower().endswith(valid_exts)
        }

        needs_save = False

        # Remove deleted files from cache
        i = 0
        while i < len(known_names):
            name = known_names[i]
            # Match by possible filename
            matching_file = next((f for f in current_files if os.path.splitext(f)[0] == name), None)
            if not matching_file or matching_file not in current_files:
                known_names.pop(i)
                known_encodings.pop(i)
                needs_save = True
            else:
                i += 1

        # Add or update new/modified files
        for fname, mtime in current_files.items():
            name = os.path.splitext(fname)[0]
            if fname not in cache_mtimes or cache_mtimes[fname] != mtime or name not in known_names:
                fpath = os.path.join(DB_DIR, fname)
                try:
                    img = face_recognition.load_image_file(fpath)
                    encs = face_recognition.face_encodings(img)
                    if encs:
                        if name in known_names:
                            idx = known_names.index(name)
                            known_encodings[idx] = encs[0]
                        else:
                            known_names.append(name)
                            known_encodings.append(encs[0])
                        cache_mtimes[fname] = mtime
                        needs_save = True
                        print(f"[FaceAPI] Loaded face encoding for: {name}")
                    else:
                        print(f"[FaceAPI] Warning: No face detected in {fname}")
                except Exception as ex:
                    print(f"[FaceAPI] Error processing {fname}: {ex}")

        if needs_save or not loaded_from_disk:
            try:
                with open(CACHE_FILE, 'wb') as f:
                    pickle.dump({
                        'encodings': known_encodings,
                        'names': known_names,
                        'mtimes': cache_mtimes
                    }, f)
            except Exception as ex:
                print(f"[FaceAPI] Error saving cache: {ex}")

        print(f"[FaceAPI] Total faces indexed: {len(known_names)} -> {known_names}")


# Initialize cache at module load
sync_encodings()


@app.route('/face/health', methods=['GET'])
def health():
    return jsonify({
        'ok': True,
        'count': len(known_names),
        'users': known_names,
        'timestamp': time.time()
    })


@app.route('/face/reload', methods=['POST'])
def reload_faces():
    sync_encodings()
    return jsonify({'ok': True, 'count': len(known_names), 'users': known_names})


@app.route('/face/login', methods=['POST'])
def face_login():
    t0 = time.time()
    payload = request.get_json(silent=True) or {}
    raw_img = payload.get('image')

    if not raw_img:
        return jsonify({'ok': False, 'error': 'No image provided in request'}), 400

    if not known_encodings:
        return jsonify({'ok': False, 'error': 'No faces registered yet. Please register your face first.'}), 404

    try:
        img_arr = decode_image_from_base64(raw_img)
    except Exception as e:
        return jsonify({'ok': False, 'error': f'Invalid image format: {str(e)}'}), 400

    try:
        # Fast HOG face detector on in-memory array
        face_locations = face_recognition.face_locations(img_arr, model='hog')
        if not face_locations:
            return jsonify({'ok': False, 'error': 'No face detected. Please ensure your face is well-lit and facing the camera.'}), 400

        face_encs = face_recognition.face_encodings(img_arr, known_face_locations=face_locations)
        if not face_encs:
            return jsonify({'ok': False, 'error': 'Could not extract facial features. Please try again with better lighting.'}), 400

        target_enc = face_encs[0]

        # Fast vectorized distance comparison
        with db_lock:
            distances = face_recognition.face_distance(known_encodings, target_enc)
            best_idx = int(np.argmin(distances))
            min_dist = float(distances[best_idx])
            name = known_names[best_idx]

        dt_ms = round((time.time() - t0) * 1000, 1)

        if min_dist <= TOLERANCE:
            confidence = round(max(0.0, (1.0 - (min_dist / TOLERANCE))) * 100, 1)
            # Log attendance / login
            try:
                with open(LOG_FILE, 'a') as f:
                    f.write(f"{name},{datetime.datetime.now().isoformat()},{round(min_dist, 4)}\n")
            except Exception:
                pass

            return jsonify({
                'ok': True,
                'username': name,
                'confidence': confidence,
                'distance': round(min_dist, 3),
                'elapsed_ms': dt_ms
            })
        else:
            return jsonify({
                'ok': False,
                'error': 'Face not recognized. Please face the camera directly or register if new.',
                'distance': round(min_dist, 3),
                'elapsed_ms': dt_ms
            }), 401

    except Exception as e:
        return jsonify({'ok': False, 'error': f'Recognition error: {str(e)}'}), 500


@app.route('/face/register', methods=['POST'])
def face_register():
    data = request.get_json(silent=True) or {}
    username = str(data.get('username') or '').strip()
    image = data.get('image')
    sec_key = data.get('secretKey') or data.get('secreteKey')

    if sec_key != SECRET_KEY:
        return jsonify({'ok': False, 'error': 'Invalid secret key'}), 403

    if not username:
        return jsonify({'ok': False, 'error': 'Username is required'}), 400

    # Sanitize username to prevent directory traversal and special chars
    if not re.match(r'^[a-zA-Z0-9_\-\@\.]+$', username):
        return jsonify({'ok': False, 'error': 'Username can only contain letters, numbers, _, -, @, and .'}), 400

    if username.lower() in ('unknown_person', 'no_persons_found', 'no_person_found'):
        return jsonify({'ok': False, 'error': 'Reserved username'}), 400

    if not image:
        return jsonify({'ok': False, 'error': 'Image is required for face registration'}), 400

    try:
        img_arr = decode_image_from_base64(image)
    except Exception as e:
        return jsonify({'ok': False, 'error': f'Invalid image data: {str(e)}'}), 400

    try:
        face_locations = face_recognition.face_locations(img_arr, model='hog')
        if not face_locations:
            return jsonify({'ok': False, 'error': 'No face detected in the image. Please position yourself facing the camera.'}), 400

        if len(face_locations) > 1:
            return jsonify({'ok': False, 'error': 'Multiple faces detected. Please make sure only one person is in the frame.'}), 400

        encs = face_recognition.face_encodings(img_arr, known_face_locations=face_locations)
        if not encs:
            return jsonify({'ok': False, 'error': 'Could not extract facial landmarks.'}), 400

        new_enc = encs[0]

        # Save image to db directory
        save_path = os.path.join(DB_DIR, f"{username}.jpg")
        pil_img = Image.fromarray(img_arr)
        pil_img.save(save_path, quality=92)
        mtime = os.path.getmtime(save_path)

        # Update in-memory encodings and disk cache immediately
        with db_lock:
            if username in known_names:
                idx = known_names.index(username)
                known_encodings[idx] = new_enc
            else:
                known_names.append(username)
                known_encodings.append(new_enc)
            cache_mtimes[f"{username}.jpg"] = mtime

            try:
                with open(CACHE_FILE, 'wb') as f:
                    pickle.dump({
                        'encodings': known_encodings,
                        'names': known_names,
                        'mtimes': cache_mtimes
                    }, f)
            except Exception as ex:
                print(f"[FaceAPI] Warning saving cache: {ex}")

        return jsonify({'ok': True, 'username': username, 'message': 'Face registered successfully'})

    except Exception as e:
        return jsonify({'ok': False, 'error': f'Registration error: {str(e)}'}), 500


if __name__ == '__main__':
    print("[FaceAPI] Starting Face Recognition Microservice on port 5001...")
    app.run(host='0.0.0.0', port=5001, debug=False)