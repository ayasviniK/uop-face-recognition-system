import time
import json
import os
import pymysql
from pymysql.cursors import SSCursor
import numpy as np

def build_embeddings_cache():
    print("Connecting to MySQL...")
    t0 = time.time()
    conn = pymysql.connect(
        host="localhost",
        user="root",
        password="123Root",
        db="uop_db",
        cursorclass=SSCursor
    )
    cur = conn.cursor()
    print("Streaming embeddings from MySQL...")
    cur.execute("SELECT student_id, embedding_original FROM embeddings")

    student_ids = []
    vectors = []
    count = 0
    while True:
        rows = cur.fetchmany(2000)
        if not rows:
            break
        for sid, emb_json in rows:
            student_ids.append(sid)
            vectors.append(json.loads(emb_json))
        count += len(rows)
        print(f"  Streamed {count} students... ({time.time()-t0:.1f}s)")

    t1 = time.time()
    print(f"Finished reading {count} rows in {t1-t0:.2f}s")
    cur.close()
    conn.close()

    vectors = np.array(vectors, dtype=np.float32)
    norms = np.linalg.norm(vectors, axis=1, keepdims=True)
    norms[norms == 0] = 1e-10
    normalized_vectors = vectors / norms
    student_ids_arr = np.array(student_ids)

    cache_file = os.path.join(os.path.dirname(__file__), "embeddings_cache.npz")
    np.savez_compressed(cache_file, student_ids=student_ids_arr, embeddings=normalized_vectors)
    t2 = time.time()
    file_size_mb = os.path.getsize(cache_file) / (1024 * 1024)
    print(f"Saved {cache_file} ({file_size_mb:.2f} MB) in {t2-t1:.2f}s.")
    print(f"Total time: {t2-t0:.2f}s.")

if __name__ == "__main__":
    build_embeddings_cache()
