import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "sub-office";

export const Decision = () => (
  <Dialog open>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Share 12 March invoices with Tom?</DialogTitle>
        <DialogDescription>
          Tom's bot asked for them for the quarter close. Nothing is sent until
          you say so.
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button variant="outline">Not yet</Button>
        <Button variant="brand">Share</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);
