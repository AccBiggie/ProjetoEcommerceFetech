import { useEffect, useState } from 'react';
import axios from 'axios';
import { Alert, Button, Card, Stack, Typography } from '@mui/material';
import Page from '../layout/Page';
import { getErrorMessage } from '../../utils/api';
const labels = { REQUESTED: 'Solicitada', COMPLETED: 'Concluída', CANCELLED: 'Cancelada' };
export default function Privacy() {
  const [request, setRequest] = useState(null), [overview, setOverview] = useState(null), [error, setError] = useState(''), [pending, setPending] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([axios.get('/api/v1/me/privacy/anonymization-request', { signal: controller.signal }), axios.get('/api/v1/me/privacy/data-overview', { signal: controller.signal })])
      .then(([r, o]) => { if (!controller.signal.aborted) { setRequest(r.data.request); setOverview(o.data.overview); } })
      .catch(e => { if (!controller.signal.aborted) setError(getErrorMessage(e)); }).finally(() => { if (!controller.signal.aborted) setPending(false); });
    return () => controller.abort();
  }, []);
  const act = async cancel => {
    setPending(true); setError('');
    try { const { data } = cancel ? await axios.patch('/api/v1/me/privacy/anonymization-request/cancel', {}) : await axios.post('/api/v1/me/privacy/anonymization-request', {}); setRequest(data.request); }
    catch (e) { setError(getErrorMessage(e)); } finally { setPending(false); }
  };
  return <Page title="Privacidade" subtitle="Gerencie a solicitação de anonimização da sua conta.">
    <Card sx={{ p: 3, maxWidth: 780 }}><Stack spacing={2}>
      <Typography>Solicitar não executa a anonimização imediatamente e não encerra sua sessão. A equipe precisa desativar a conta antes de executar a solicitação.</Typography>
      <Typography>A anonimização da conta é irreversível. Nome, e-mail e credenciais serão substituídos, endereços pessoais removidos e o avatar desvinculado. Alguns registros históricos, incluindo dados de entrega de pedidos, podem ser preservados conforme as políticas de retenção aplicáveis.</Typography>
      <Typography>Os prazos de retenção histórica ainda dependem de definição formal. Comentários de avaliações são preservados e podem exigir revisão específica se contiverem dados pessoais.</Typography>
      {error && <Alert severity="error">{error}</Alert>}
      <Typography role="status">Solicitação: {request ? labels[request.status] : 'Nenhuma solicitação'}</Typography>
      {overview && <Typography>Seu catálogo pessoal: {overview.addresses} endereços, {overview.orders} pedidos, {overview.reviews} avaliações.</Typography>}
      <Button variant="contained" disabled={pending || request?.status === 'REQUESTED'} onClick={() => act(false)}>Solicitar anonimização da conta</Button>
      {request?.status === 'REQUESTED' && <Button disabled={pending} onClick={() => act(true)}>Cancelar solicitação</Button>}
    </Stack></Card>
  </Page>;
}
