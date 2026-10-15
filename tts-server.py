import http.server, subprocess, urllib.parse, tempfile, os

class H(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        text = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query).get("text", [""])[0]
        f = tempfile.mktemp(suffix=".wav")
        subprocess.run(["say", "-o", f, "--data-format=LEI16@48000", text], check=True)
        data = open(f, "rb").read(); os.remove(f)
        self.send_response(200)
        self.send_header("Content-Type", "audio/wav")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers(); self.wfile.write(data)

http.server.HTTPServer(("127.0.0.1", 8765), H).serve_forever()
