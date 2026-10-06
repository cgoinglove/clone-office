import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "sub-office";

export const Requests = () => (
  <div style={{ width: 520 }}>
    <Table>
      <TableCaption>Requests your bot handled today</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>From</TableHead>
          <TableHead>Asked for</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell>Tom</TableCell>
          <TableCell>The March invoices</TableCell>
          <TableCell>Needs you</TableCell>
        </TableRow>
        <TableRow>
          <TableCell>Sofia</TableCell>
          <TableCell>Acme's payment status</TableCell>
          <TableCell>Answered</TableCell>
        </TableRow>
        <TableRow>
          <TableCell>Raj</TableCell>
          <TableCell>The spring budget left</TableCell>
          <TableCell>Answered</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  </div>
);
