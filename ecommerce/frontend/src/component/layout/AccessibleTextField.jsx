import { useId, useState } from 'react';
import { TextField } from '@mui/material';

// Keep browser constraint validation and connect its errors to MUI's helper text.
export default function AccessibleTextField({ id, error, helperText, onInvalid, onChange, slotProps = {}, ...props }) {
  const generatedId = useId();
  const [constraintError, setConstraintError] = useState('');
  return <TextField {...props} id={id || generatedId} error={Boolean(error || constraintError)}
    helperText={constraintError || helperText}
    slotProps={{ ...slotProps, formHelperText: { role: constraintError ? 'alert' : undefined, ...slotProps.formHelperText } }}
    onInvalid={event => {
      const { validity } = event.target;
      setConstraintError(validity.valueMissing ? 'Preencha este campo obrigatório.'
        : validity.typeMismatch ? 'Informe um valor no formato solicitado.'
        : validity.tooShort ? 'O valor informado é muito curto.'
        : validity.tooLong ? 'O valor informado é muito longo.'
        : 'Confira o formato ou os limites deste campo.');
      onInvalid?.(event);
    }}
    onChange={event => { setConstraintError(''); onChange?.(event); }} />;
}
