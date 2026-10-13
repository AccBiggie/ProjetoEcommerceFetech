import { useEffect, useState } from 'react';
import axios from 'axios';
import { Alert, Box, Button, LinearProgress, Stack, TableCell, TableRow, Typography } from '@mui/material';
import TextField from '../layout/AccessibleTextField';
import DataTable from '../layout/DataTable';
import { getErrorMessage } from '../../utils/api';
export default function AuditTrail() {
  const [page, setPage] = useState(1);
  const [draftId, setDraftId] = useState('');
  const [requestId, setRequestId] = useState('');
  const [data, setData] = useState({ events: [], pagination: { total: 0, pages: 0 } });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    axios.get('/api/v1/admin/audit-events', { params: { page, limit: 25, ...(requestId ? { requestId } : {}) } })
      .then(response => { if (active) setData(response.data); })
      .catch(error => { if (active) { setData({ events: [], pagination: { total: 0, pages: 0 } }); setError(getErrorMessage(error)); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [page, requestId]);
  return <Box>
    <Typography variant="h5" component="h2">Auditoria administrativa</Typography>
    <Stack component="form" direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mt: 2 }} onSubmit={event => { event.preventDefault(); setPage(1); setRequestId(draftId.trim()); }}>
      <TextField label="Código de suporte (Request ID)" value={draftId} onChange={event => setDraftId(event.target.value)} size="small" fullWidth />
      <Button type="submit" disabled={loading}>Buscar eventos</Button>
      <Button disabled={loading} onClick={() => { setDraftId(''); setRequestId(''); setPage(1); }}>Limpar filtro</Button>
    </Stack>
    {loading && <LinearProgress sx={{ mt: 2 }} />}
    {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
    <DataTable label="Eventos de auditoria administrativa" columns={['Data/hora', 'Ação', 'Recurso', 'Ator ID', 'Request ID']}>
      {data.events.map(event => <TableRow key={event._id}>
        <TableCell>{new Date(event.createdAt).toLocaleString('pt-BR')}</TableCell>
        <TableCell>{event.action}</TableCell>
        <TableCell sx={{ overflowWrap: 'anywhere' }}>{event.targetType}: {event.targetId}</TableCell>
        <TableCell sx={{ overflowWrap: 'anywhere' }}>{event.actorUserId}</TableCell>
        <TableCell sx={{ overflowWrap: 'anywhere' }}>{event.requestId}</TableCell>
      </TableRow>)}
      {!loading && data.events.length === 0 && <TableRow><TableCell colSpan={5}>Nenhum evento encontrado.</TableCell></TableRow>}
    </DataTable>
    <Stack direction="row" spacing={2} useFlexGap sx={{ flexWrap: 'wrap' }} alignItems="center">
      <Button disabled={loading || page === 1} onClick={() => setPage(value => value - 1)}>Página anterior</Button>
      <Typography role="status" aria-current="page">Página {page} de {Math.max(1, data.pagination.pages)} · {data.pagination.total} eventos</Typography>
      <Button disabled={loading || page >= data.pagination.pages} onClick={() => setPage(value => value + 1)}>Próxima página</Button>
    </Stack>
  </Box>;
}
