'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.join(__dirname,'../..');
test('first directory cycle binds eight exact existing broker files by SHA256',()=>{
 const m=JSON.parse(fs.readFileSync(path.join(root,'scripts/linux/directory-cycle-broker-sha256.json'),'utf8'));
 assert.equal(Object.keys(m).length,8);
 for(const [name,hash]of Object.entries(m)){assert.match(name,/^[a-z-]+\.js$/);assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'server/demo-platform',name))).digest('hex'),hash);}
});
test('first cycle requires explicit root interactive identity and read-only checks before exclusive journal',()=>{
 const s=fs.readFileSync(path.join(root,'scripts/linux/apply-demo-directory-first-cycle.py'),'utf8');
 for(const v of ['--check-only','--apply-confirmed','sys.stdin.isatty()','sql_checks(source,password);del password','data=preflight(source);stage=','os.O_EXCL|os.O_NOFOLLOW','existing_cycle_requires_review',"result['jobRevision']!=9","result['generation']!=4",'DO_NOT_RETRY_DO_NOT_DELETE'])assert.ok(s.includes(v),v);
 assert.ok(s.indexOf("if sys.argv[1:]==['--check-only']")<s.indexOf("password=getpass.getpass"));
 assert.ok(!/useradd|groupadd|ALTER LOGIN|chmod\(SECRET|write_text\(/.test(s));
});
