import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, TableCell, TableRow, Typography } from '@mui/material';
import TextField from '../layout/AccessibleTextField';
import DataTable from '../layout/DataTable';
import { getErrorMessage } from '../../utils/api';
import { restoreActionFocus } from '../../utils/restoreActionFocus';
export default function PrivacyRequests() {
  const actionTrigger = useRef(null);
  const [page, setPage] = useState(1), [status, setStatus] = useState('REQUESTED'), [data, setData] = useState({ requests: [], pagination: { pages: 0, total: 0 } });
  const [error, setError] = useState(''), [target, setTarget] = useState(null), [confirmation, setConfirmation] = useState(''), [pending, setPending] = useState(false), [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); setPending(true);
    axios.get('/api/v1/admin/privacy/requests', { params: { page, limit: 25, status }, signal: controller.signal })
      .then(r => { if (!controller.signal.aborted) setData(r.data); }).catch(e => { if (!controller.signal.aborted) setError(getErrorMessage(e)); }).finally(() => { if (!controller.signal.aborted) { setPending(false); restoreActionFocus(actionTrigger.current); } });
    return () => controller.abort();
  }, [page, status, revision]);
  const execute = async () => {
    setPending(true); setError('');
    try { await axios.post(`/api/v1/admin/privacy/requests/${target._id}/anonymize`, { confirmation }); setTarget(null); setConfirmation(''); setRevision(value => value + 1); }
    catch (e) { setError(getErrorMessage(e)); } finally { setPending(false); restoreActionFocus(actionTrigger.current); }
  };
  return <Box><Stack spacing={2}>
    <Typography variant="h2">Solicitações de privacidade</Typography>
    {error && <Alert severity="error">{error}</Alert>}
    <TextField select label="Status da solicitação" value={status} disabled={pending} onChange={e => { setStatus(e.target.value); setPage(1); }}>{[['REQUESTED', 'Solicitadas'], ['COMPLETED', 'Concluídas'], ['CANCELLED', 'Canceladas']].map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}</TextField>
    <DataTable label="Solicitações de privacidade" columns={['Conta', 'Solicitação', 'Estado da conta', 'Ação']} loading={pending}>
      {data.requests.map(row => <TableRow key={row._id}><TableCell>{row.user}</TableCell><TableCell>{row.status}</TableCell><TableCell>{row.accountStatus === 'DEACTIVATED' ? 'Desativada' : 'Ativa'}{!row.eligible && row.status === 'REQUESTED' && ' — desativação e papel não administrativo obrigatórios'}</TableCell><TableCell><Button disabled={pending || !row.eligible} onClick={() => { actionTrigger.current = document.activeElement; setError(''); setTarget(row); setConfirmation(''); }}>Anonimizar</Button></TableCell></TableRow>)}
      {!pending && !data.requests.length && <TableRow><TableCell colSpan={4}>Nenhuma solicitação encontrada.</TableCell></TableRow>}
    </DataTable>
    <Stack direction="row" spacing={2} useFlexGap sx={{ flexWrap: 'wrap' }}><Button disabled={pending || page === 1} onClick={() => setPage(value => value - 1)}>Página anterior</Button><Typography role="status" aria-current="page">Página {page} de {Math.max(1, data.pagination.pages)} · {data.pagination.total} solicitações</Typography><Button disabled={pending || page >= data.pagination.pages} onClick={() => setPage(value => value + 1)}>Próxima página</Button></Stack>
    <Dialog open={Boolean(target)} slotProps={{ transition: { onExited: () => restoreActionFocus(actionTrigger.current) } }} aria-labelledby="privacy-confirm-title" aria-describedby="privacy-confirm-description" onClose={() => { if (!pending) setTarget(null); }}><DialogTitle id="privacy-confirm-title">Anonimizar conta</DialogTitle><DialogContent>{error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}<Typography id="privacy-confirm-description">Esta operação é irreversível. O histórico comercial e seus dados de entrega são preservados. Digite exatamente:</Typography><Typography sx={{ overflowWrap: 'anywhere', my: 2 }}>ANONIMIZAR {target?.user}</Typography><TextField autoFocus label="Confirmação de anonimização" value={confirmation} onChange={e => setConfirmation(e.target.value)} fullWidth autoComplete="off" /></DialogContent><DialogActions><Button disabled={pending} onClick={() => setTarget(null)}>Cancelar</Button><Button disabled={pending || confirmation !== 'ANONIMIZAR ' + target?.user} onClick={execute}>Confirmar anonimização</Button></DialogActions></Dialog>
  </Stack></Box>;
}
