import { Bubble, BubbleContent, BubbleGroup } from "sub-office";

export const Thread = () => (
  <div style={{ width: 420 }}>
    <BubbleGroup>
      <Bubble variant="secondary">
        <BubbleContent>
          Mina's bot has the March invoices. Want them shared with Tom?
        </BubbleContent>
      </Bubble>
      <Bubble align="end">
        <BubbleContent>Yes, all 12 please.</BubbleContent>
      </Bubble>
      <Bubble variant="secondary">
        <BubbleContent>Done. Tom has them in the thread.</BubbleContent>
      </Bubble>
    </BubbleGroup>
  </div>
);

export const Variants = () => (
  <div style={{ width: 420 }}>
    <BubbleGroup>
      <Bubble>
        <BubbleContent>Default</BubbleContent>
      </Bubble>
      <Bubble variant="secondary">
        <BubbleContent>Secondary</BubbleContent>
      </Bubble>
      <Bubble variant="muted">
        <BubbleContent>Muted</BubbleContent>
      </Bubble>
      <Bubble variant="tinted">
        <BubbleContent>Tinted</BubbleContent>
      </Bubble>
      <Bubble variant="outline">
        <BubbleContent>Outline</BubbleContent>
      </Bubble>
      <Bubble variant="destructive">
        <BubbleContent>
          The export failed: a date in the wrong format.
        </BubbleContent>
      </Bubble>
    </BubbleGroup>
  </div>
);
