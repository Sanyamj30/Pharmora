import base64
import os
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.backends import default_backend

from services.sales_service.app.config import settings


class AES256Cipher:
    def __init__(self, key: str):
        # Enforce key length of 32 bytes for AES-256
        self.key = key.encode("utf-8")[:32].ljust(32, b'\0')

    def encrypt(self, plaintext: str) -> str:
        if not plaintext:
            return ""
        iv = os.urandom(12) # GCM standard IV size is 12 bytes
        encryptor = Cipher(
            algorithms.AES(self.key),
            modes.GCM(iv),
            backend=default_backend()
        ).encryptor()
        
        ciphertext = encryptor.update(plaintext.encode("utf-8")) + encryptor.finalize()
        tag = encryptor.tag
        
        # Combine iv + tag + ciphertext
        combined = iv + tag + ciphertext
        return base64.b64encode(combined).decode("utf-8")

    def decrypt(self, ciphertext_b64: str) -> str:
        if not ciphertext_b64:
            return ""
        try:
            combined = base64.b64decode(ciphertext_b64.encode("utf-8"))
            iv = combined[:12]
            tag = combined[12:28]
            ciphertext = combined[28:]
            
            decryptor = Cipher(
                algorithms.AES(self.key),
                modes.GCM(iv, tag),
                backend=default_backend()
            ).decryptor()
            
            plaintext = decryptor.update(ciphertext) + decryptor.finalize()
            return plaintext.decode("utf-8")
        except Exception as e:
            raise ValueError(f"Decryption failed: {e}")


# Global cipher instance
cipher = AES256Cipher(settings.PRESCRIPTION_AES_KEY)
