import {
  Button,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "sub-office";

export const Open = () => (
  <div style={{ padding: "56px 24px 8px" }}>
    <TooltipProvider>
      <Tooltip open>
        <TooltipTrigger render={<Button variant="outline">Away</Button>} />
        <TooltipContent>
          Your bot answers what it can and keeps the rest for you
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  </div>
);
