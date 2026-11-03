"""Wire durable cycle to an explicitly supplied private pipe. No default launcher."""
import importlib.util
from pathlib import Path
def run(request,inventory,journal,pipe_factory):
    if not all(callable(p) for p in (inventory,journal,pipe_factory)):raise RuntimeError('trusted_cycle_ports_required')
    spec=importlib.util.spec_from_file_location('cycle',Path(__file__).with_name('directory-cycle-orchestrator.py'))
    cycle=importlib.util.module_from_spec(spec);spec.loader.exec_module(cycle)
    pipes=[];state={}
    def journal_port(private):
        result=journal(private)
        try:
            pipe=pipe_factory();pipes.append(pipe)
            pipe.call('init',{k:private[k] for k in ('jobId','trialId','intentId','priorOsIntentId','attemptId','uid','gid','expectedJobRevision')})
            state['pipe']=pipe
        except Exception:
            try:result.append('review_required',{'failedStage':'created'})
            except Exception:pass
            raise RuntimeError('directory_cycle_init_requires_review') from None
        return result
    try:
        return cycle.run(request,{'inventory':inventory,'journal':journal_port,
            'claim':lambda p:state['pipe'].call('claim',p),'intent':lambda p:state['pipe'].call('intent',p),
            'prepare':lambda b,t:state['pipe'].call('prepare',t),'release':lambda p:state['pipe'].call('release',p)})
    finally:
        failed=False
        for pipe in reversed(pipes):
            try:pipe.close()
            except Exception:failed=True
        state.clear()
        if failed:raise RuntimeError('directory_cycle_pipe_close_requires_review') from None
