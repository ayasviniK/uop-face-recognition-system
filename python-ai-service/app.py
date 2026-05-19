from flask import Flask, jsonify

app = Flask(__name__)

@app.route("/")
def home():
    return "Flask AI Service Running"

@app.route("/health")
def health():
    return jsonify({
        "status": "running",
        "service": "AI Face Recognition Service"
    })

if __name__ == "__main__":
    app.run(debug=True)