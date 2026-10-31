"""Private SQL wiring only. No CLI, default host runner, credentials or automatic resume."""
import importlib.util
from pathlib import Path

def module(name):
    spec=importlib.util.spec_from_file_location(name,Path(__file__).with_name(name+'.py'))
    m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m

def run(request,inventory,journal,host,pipe_factory=None):
    if not all(callable(p) for p in (inventory,journal,host)):raise RuntimeError('trusted_ports_required')
    if pipe_factory is None:pipe_factory=module('os-pilot-sql-ipc').SqlPipe
    pipes=[];state={}
    def journal_port(private):
        # Persist bootstrap before opening any SQL child or requesting a lease.
        result=journal(private)
        worker=pipe_factory('worker');pipes.append(worker)
        worker.call('init',{k:private[k] for k in ('jobId','trialId','intentId','expectedJobRevision')})
        state['worker']=worker
        return result
    def prepare(binding,lease,delegation):
        state['binding']=dict(binding)
        return state['worker'].call('prepare',{'leaseToken':lease,'delegationToken':delegation})
    def accept(binding,token):
        if binding!=state.get('binding'):raise RuntimeError('binding_refused')
        executor=pipe_factory('executor');pipes.append(executor)
        executor.call('init',{'binding':binding});state['executor']=executor
        return executor.call('accept',{'delegationToken':token})
    def host_port(binding,token):
        if binding!=state.get('binding'):raise RuntimeError('binding_refused')
        return host(binding,lambda:state['executor'].call('context',{'delegationToken':token}))
    def report(binding,token,result):
        if binding!=state.get('binding'):raise RuntimeError('binding_refused')
        return state['executor'].call('report',{'delegationToken':token,**result})
    try:
        return module('os-pilot-orchestrator').run_pilot(request,{
            'inventory':inventory,'journal':journal_port,
            'claim':lambda p:state['worker'].call('claim',p),
            'intent':lambda p:state['worker'].call('intent',p),
            'prepare':prepare,'accept':accept,'host':host_port,'report':report,
            'release':lambda p:state['worker'].call('release',p)})
    finally:
        failed=False
        for pipe in reversed(pipes):
            try:pipe.close()
            except Exception:failed=True
        state.clear()
        if failed:raise RuntimeError('pilot_pipe_cleanup_requires_review') from None
