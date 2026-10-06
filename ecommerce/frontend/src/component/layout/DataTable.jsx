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
    <TableContainer component={Paper} variant="outlined" sx={{ my: 3 }}>
      <Table aria-label={label} sx={{ minWidth: 560 }}>
        <TableHead>
          <TableRow>
            {columns.map((column) => (
              <TableCell key={column}>{column}</TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>{children}</TableBody>
      </Table>
    </TableContainer>
  );
}
