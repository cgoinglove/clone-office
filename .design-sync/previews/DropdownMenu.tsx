import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "sub-office";

export const Open = () => (
  <div style={{ height: 260 }}>
    <DropdownMenu open>
      <DropdownMenuTrigger
        render={<Button variant="outline">Reply mode</Button>}
      />
      <DropdownMenuContent>
        <DropdownMenuGroup>
          <DropdownMenuLabel>When a request comes in</DropdownMenuLabel>
          <DropdownMenuItem>Ask me first</DropdownMenuItem>
          <DropdownMenuItem>Act, then tell me</DropdownMenuItem>
          <DropdownMenuItem>Act alone</DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive">Pause my bot</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>
);
