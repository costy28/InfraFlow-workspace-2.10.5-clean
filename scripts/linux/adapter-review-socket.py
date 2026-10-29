#!/usr/bin/env python3
"""Future socket-activated review channel. No tenant effects, shell or TCP listener."""
import json
import os
import re
import socket
import stat
import struct
import subprocess
import sys
import time

SOCKET_PATH = '/run/infraflow-demo-adapter-review.sock'
NODE = '/usr/local/bin/node'
BRIDGE = '/opt/infraflow-demo-platform/releases/adapter-channel-v1/adapter-consume-stdin.js'
UUID = re.compile(r'[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}', re.ASCII)

def unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError('duplicate_key')
        result[key] = value
    return result

def parse_request(raw):
    if not isinstance(raw, bytes) or not 1 <= len(raw) <= 1024:
        raise ValueError('request_invalid')
    value = json.loads(raw.decode('ascii'), object_pairs_hook=unique_object)
    if type(value) is not dict or set(value) != {'intentId', 'ticketToken'}:
        raise ValueError('request_invalid')
    if type(value['intentId']) is not str or not UUID.fullmatch(value['intentId']):
        raise ValueError('request_invalid')
    if type(value['ticketToken']) is not str or not re.fullmatch(r'[a-f0-9]{64}', value['ticketToken'], re.ASCII):
        raise ValueError('request_invalid')
    return value

def read_request(conn, clock=time.monotonic):
    end = clock() + 3
    raw = bytearray()
    while True:
        remaining = end - clock()
        if remaining <= 0:
            raise TimeoutError()
        conn.settimeout(remaining)
        chunk = conn.recv(min(1025 - len(raw), 1024))
        if not chunk:
            return parse_request(bytes(raw))
        raw.extend(chunk)
        if len(raw) > 1024:
            raise ValueError('request_invalid')

def peer_allowed(conn):
    # Linux kernel identity, never a UID/PID supplied in JSON.
    _, uid, _ = struct.unpack('3i', conn.getsockopt(socket.SOL_SOCKET, socket.SO_PEERCRED, struct.calcsize('3i')))
    return uid == 994

def validate_receipt(raw, intent):
    if not isinstance(raw, bytes) or len(raw) > 2048:
        raise ValueError()
    r = json.loads(raw.decode('ascii'), object_pairs_hook=unique_object)
    if type(r) is not dict or set(r) != {'jobId','intentId','generation','jobRevision','step','operation','executionAllowed'}:
        raise ValueError()
    if r['intentId'] != intent or type(r['jobId']) is not str or not UUID.fullmatch(r['jobId']):
        raise ValueError()
    if any(type(r[k]) is not int or not 1 <= r[k] < 2147483647 for k in ('generation','jobRevision')):
        raise ValueError()
    if r['operation'] != 'consume' or r['executionAllowed'] is not False or r['step'] not in (
            'os_identity','tenant_directories','tenant_key','sql_database','sql_login','schema_bootstrap','runtime_unit'):
        raise ValueError()
    return r

def consume(request):
    # Fixed root-owned bridge, fixed operation, private stdin pipe, no shell or token argv.
    result = subprocess.run([NODE, BRIDGE], input=json.dumps(request).encode('ascii'),
                            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=8,
                            env={'PATH':'/usr/local/bin:/usr/bin:/bin',
                                 'CREDENTIALS_DIRECTORY':'/run/credentials/infraflow-demo-adapter-review.service'})
    if result.returncode:
        raise RuntimeError('review_unconfirmed')
    return validate_receipt(result.stdout, request['intentId'])

def handle(conn, consumer=consume, authorize=peer_allowed):
    try:
        if not authorize(conn):
            raise PermissionError()
        request = read_request(conn)
        receipt = validate_receipt(json.dumps(consumer(request)).encode('ascii'), request['intentId'])
        response = {'ok':True,'receipt':receipt}
    except Exception:
        response = {'ok':False,'code':'review_unconfirmed'}
    try:
        conn.settimeout(1)
        conn.sendall(json.dumps(response, separators=(',',':')).encode('ascii'))
    except OSError:
        pass  # May already be consumed. Never retry or report successful cleanup.

def validate_bridge():
    # Bridge and all parents must be immutable to worker/service identities.
    path = BRIDGE
    while True:
        info = os.lstat(path)
        if stat.S_ISLNK(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o022:
            raise RuntimeError()
        if path == BRIDGE and not stat.S_ISREG(info.st_mode):
            raise RuntimeError()
        parent = os.path.dirname(path)
        if parent == path:
            break
        path = parent

def main():
    if sys.platform != 'linux' or sys.argv[1:] != ['--serve-review-only']:
        sys.exit('ADAPTER_CHANNEL_REFUSED')
    import pwd
    identity = pwd.getpwnam('infraflow-demo-adapter-review')
    worker = pwd.getpwnam('infraflow-demo-worker')
    if os.getuid() == 0 or os.getuid() != identity.pw_uid or os.getgid() != identity.pw_gid or worker.pw_uid != 994 or worker.pw_gid != 985:
        sys.exit('ADAPTER_CHANNEL_REFUSED')
    if os.environ.get('LISTEN_PID') != str(os.getpid()) or os.environ.get('LISTEN_FDS') != '1':
        sys.exit('ADAPTER_CHANNEL_REFUSED')
    validate_bridge()
    parent = os.lstat('/run')
    if not stat.S_ISDIR(parent.st_mode) or parent.st_uid != 0 or parent.st_mode & 0o022:
        sys.exit('ADAPTER_CHANNEL_REFUSED')
    info = os.lstat(SOCKET_PATH)
    if not stat.S_ISSOCK(info.st_mode) or info.st_uid != 0 or info.st_gid != 985 or stat.S_IMODE(info.st_mode) != 0o660:
        sys.exit('ADAPTER_CHANNEL_REFUSED')
    listener = socket.socket(fileno=3)
    if listener.family != socket.AF_UNIX or listener.type != socket.SOCK_STREAM or listener.getsockname() != SOCKET_PATH:
        sys.exit('ADAPTER_CHANNEL_REFUSED')
    while True:
        conn, _ = listener.accept()
        with conn:
            handle(conn)

if __name__ == '__main__':
    try:
        main()
    except Exception:
        sys.exit('ADAPTER_CHANNEL_UNCONFIRMED')
