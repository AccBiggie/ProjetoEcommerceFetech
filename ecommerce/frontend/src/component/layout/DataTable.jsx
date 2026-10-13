import {
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from "@mui/material";
export default function DataTable({ columns, children, label }) {
  return (
    <TableContainer component={Paper} variant="outlined" tabIndex={0} role="region" aria-label={label} sx={{ my: 3 }}>
      <Table aria-label={label} sx={{ minWidth: 560 }}>
        <caption style={{ textAlign: 'left', padding: 12 }}>{label}</caption>
        <TableHead>
          <TableRow>
            {columns.map((column) => (
              <TableCell key={column} scope="col">{column}</TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>{children}</TableBody>
      </Table>
    </TableContainer>
  );
}
