from flask import Flask, request, jsonify
import subprocess
import tempfile
import os
import base64



app = Flask(__name__)
DB_DIR = os.path.join(os.path.dirname(__file__), 'db')


@app.route('/face/login', methods=['POST'])
def face_login():
    data = request.json.get('image')
    img_bytes = base64.b64decode(data.split(',')[1])
    with tempfile.NamedTemporaryFile(suffix='.jpg', delete=False) as f:
        f.write(img_bytes)
        tmp_path = f.name
    
    try:
        output = subprocess.check_output(
            ['face_recognition', DB_DIR, tmp_path]
        ).decode().strip()
        name = output.split(',')[1].strip()
        
    except Exception:
            name = 'unknown_person'
    
    finally:
        os.remove(tmp_path)
        
    if name in ['unknown_person', 'no_person_found']:
        return jsonify({'ok': False, 'error': 'Face not recognized'}), 401
    return jsonify({'ok': True, 'username': name})


@app.route('/face/register', methods=['POST'])
def face_register():
    data = request.json
    username = data.get('username')
    image = data.get('image')
    secKey = data.get('secreteKey')
    
    if(secKey != 'Indra Arrow'):
        return jsonify({'error': 'Invalid Secrete Key'}), 403
    
    img_bytes = base64.b64decode(image.split(',')[1])
    save_path = os.path.join(DB_DIR, f'{username}.jpg')
    
    with open(save_path, 'wb') as f:
        f.write(img_bytes)
    
    return jsonify({'ok':True})

if __name__ == '__main__':
    app.run(port=5001)