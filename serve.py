# Local preview server that tells the browser not to cache, so edits show on a normal refresh.
import http.server

class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

http.server.ThreadingHTTPServer(('', 8765), NoCache).serve_forever()
