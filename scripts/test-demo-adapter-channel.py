import importlib.util
import configparser
import json
from pathlib import Path
import struct
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('channel', Path(__file__).parent/'linux/adapter-review-socket.py')
channel = importlib.util.module_from_spec(spec)
spec.loader.exec_module(channel)
INTENT = 'b1100b43-48d0-42fa-8a1d-73b1286f8242'
REQUEST = {'intentId':INTENT,'ticketToken':'ab'*32}
RECEIPT = {'jobId':'00f612ed-a8ac-4688-a26f-679760eee0be','intentId':INTENT,
           'generation':1,'jobRevision':1,'step':'os_identity','operation':'consume','executionAllowed':False}

class Connection:
    def __init__(self, chunks):
        self.chunks = list(chunks)
        self.sent = None
    def settimeout(self, value):
        pass
    def recv(self, length):
        return self.chunks.pop(0) if self.chunks else b''
    def sendall(self, value):
        self.sent = json.loads(value)

class ChannelTests(unittest.TestCase):
    def test_systemd_templates_fixed_channel_no_automatic_restart(self):
        root=Path(__file__).parent/'linux'
        sock=configparser.ConfigParser(interpolation=None)
        sock.read(root/'infraflow-demo-adapter-review.socket.example',encoding='utf-8')
        self.assertEqual(sock['Socket']['ListenStream'],channel.SOCKET_PATH)
        self.assertEqual(sock['Socket']['SocketUser'],'root')
        self.assertEqual(sock['Socket']['SocketGroup'],'infraflow-demo-worker')
        self.assertEqual(sock['Socket']['SocketMode'],'0660')
        self.assertEqual(sock['Socket']['Accept'],'no')
        self.assertEqual(sock['Socket']['Backlog'],'1')
        service=configparser.ConfigParser(interpolation=None)
        service.read(root/'infraflow-demo-adapter-review.service.example',encoding='utf-8')
        cfg=service['Service']
        self.assertEqual(cfg['User'],'infraflow-demo-adapter-review')
        self.assertEqual(cfg['KillMode'],'control-group')
        self.assertEqual(cfg['Restart'],'no')
        self.assertEqual(cfg['NoNewPrivileges'],'yes')
        self.assertEqual(cfg['ProtectSystem'],'strict')
        self.assertEqual(cfg['LoadCredential'],'adapter-sql-password:/etc/infraflow-demo-platform/adapter-review.password')
        self.assertNotIn('EnvironmentFile',cfg)
        self.assertNotIn('ExecStartPre',cfg)

    def test_exact_request(self):
        self.assertEqual(channel.parse_request(json.dumps(REQUEST).encode()), REQUEST)
        bad = [b'{}',b'null',b'[]',b'\xff',b'x'*1025,
               json.dumps({**REQUEST,'leaseToken':'cd'*32}).encode(),
               json.dumps({**REQUEST,'uid':994}).encode(),
               ('{"intentId":"'+INTENT+'","intentId":"'+INTENT+'","ticketToken":"'+'ab'*32+'"}').encode()]
        for raw in bad:
            with self.assertRaises((ValueError,UnicodeError)):
                channel.parse_request(raw)

    def test_framing_bounded_and_deadline(self):
        raw = json.dumps(REQUEST).encode()
        self.assertEqual(channel.read_request(Connection([raw[:10],raw[10:]])),REQUEST)
        with self.assertRaises(ValueError):
            channel.read_request(Connection([b'x'*1025]))
        clock = iter([0,4])
        with self.assertRaises(TimeoutError):
            channel.read_request(Connection([raw]),clock=lambda:next(clock))

    def test_kernel_peer_uid_not_payload(self):
        class Peer:
            def __init__(self, uid):self.uid=uid
            def getsockopt(self,*args):return struct.pack('3i',123,self.uid,985)
        with patch.object(channel.socket,'SO_PEERCRED',17,create=True):
            self.assertTrue(channel.peer_allowed(Peer(994)))
            for uid in [0,995,1000]:self.assertFalse(channel.peer_allowed(Peer(uid)))

    def test_denied_peer_never_reads_or_consumes(self):
        conn=Connection([json.dumps(REQUEST).encode()])
        channel.handle(conn,consumer=lambda _:self.fail('consumer called'),authorize=lambda _:False)
        self.assertEqual(conn.sent,{'ok':False,'code':'review_unconfirmed'})
        self.assertEqual(len(conn.chunks),1)

    def test_success_and_secret_bearing_backend_failure(self):
        conn=Connection([json.dumps(REQUEST).encode()])
        channel.handle(conn,consumer=lambda _:dict(RECEIPT),authorize=lambda _:True)
        self.assertEqual(conn.sent,{'ok':True,'receipt':RECEIPT})
        def fail(_):raise RuntimeError(REQUEST['ticketToken'])
        conn=Connection([json.dumps(REQUEST).encode()])
        channel.handle(conn,consumer=fail,authorize=lambda _:True)
        self.assertNotIn(REQUEST['ticketToken'],json.dumps(conn.sent))
        self.assertFalse(conn.sent['ok'])

    def test_backend_cannot_return_secrets_or_effect_authority(self):
        for value in [{**RECEIPT,'ticketToken':REQUEST['ticketToken']},{**RECEIPT,'executionAllowed':True},
                      {**RECEIPT,'generation':True},{**RECEIPT,'intentId':'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'}]:
            conn=Connection([json.dumps(REQUEST).encode()])
            channel.handle(conn,consumer=lambda _,v=value:v,authorize=lambda _:True)
            self.assertEqual(conn.sent,{'ok':False,'code':'review_unconfirmed'})

    def test_fixed_child_process_private_pipe_no_shell(self):
        class Result:
            returncode=0
            stdout=json.dumps(RECEIPT).encode()
        with patch.object(channel.subprocess,'run',return_value=Result()) as run:
            self.assertEqual(channel.consume(REQUEST),RECEIPT)
            args,kwargs=run.call_args
            self.assertEqual(args[0],[channel.NODE,channel.BRIDGE])
            self.assertNotIn('shell',kwargs)
            self.assertEqual(json.loads(kwargs['input']),REQUEST)
            self.assertEqual(kwargs['timeout'],8)

if __name__ == '__main__':
    unittest.main()
