import { useRef, useState } from 'react';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Typography } from '@mui/material';
import axios from 'axios';
import { getErrorMessage } from '../../utils/api';
export default function CancelOrder({ order, admin = false, onCancelled }) {
  const [open, setOpen] = useState(false), [pending, setPending] = useState(false), [error, setError] = useState('');
  const busy = useRef(false);
  const confirm = async () => {
    if (busy.current) return;
    busy.current = true; setPending(true); setError('');
    try {
      const { data } = await axios.post(`/api/v1/${admin ? 'admin/' : ''}order/${order._id}/cancel`, {});
      onCancelled(data.order); setOpen(false);
      requestAnimationFrame(() => { if (document.activeElement === document.body) document.querySelector('main h1')?.focus(); });
    } catch (failure) { setError(getErrorMessage(failure)); }
    finally { busy.current = false; setPending(false); }
  };
  if (!order.cancellation?.canCancel && !open) return null;
  return <>
    <Button aria-label={'Cancelar pedido ' + order._id} onClick={() => { setError(''); setOpen(true); }}>Cancelar pedido</Button>
    <Dialog open={open} onClose={() => { if (!busy.current) setOpen(false); }} aria-labelledby={'cancel-title-' + order._id} aria-describedby={'cancel-description-' + order._id}>
      <DialogTitle id={'cancel-title-' + order._id}>Cancelar este pedido?</DialogTitle>
      <DialogContent>
        <DialogContentText id={'cancel-description-' + order._id}>O pedido não seguirá o processamento normal. Este cancelamento é definitivo e libera a reserva de estoque.</DialogContentText>
        {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
        {pending && <Typography role="status">Cancelando…</Typography>}
      </DialogContent>
      <DialogActions>
        <Button autoFocus disabled={pending} onClick={() => setOpen(false)}>Voltar</Button>
        <Button variant="contained" disabled={pending} onClick={confirm}>{pending ? 'Cancelando…' : 'Confirmar cancelamento'}</Button>
      </DialogActions>
    </Dialog>
  </>;
}
