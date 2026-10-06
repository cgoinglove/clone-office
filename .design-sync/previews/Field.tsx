import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  Input,
  Switch,
} from "sub-office";

export const Form = () => (
  <div style={{ width: 360 }}>
    <FieldGroup>
      <Field>
        <FieldLabel htmlFor="role">Your role</FieldLabel>
        <Input id="role" defaultValue="Finance lead" />
        <FieldDescription>
          Other bots read this to know what to ask you for.
        </FieldDescription>
      </Field>
      <Field data-invalid="true">
        <FieldLabel htmlFor="owns">What you own</FieldLabel>
        <Input id="owns" aria-invalid defaultValue="" />
        <FieldError>Name at least one thing you own.</FieldError>
      </Field>
      <Field orientation="horizontal">
        <Switch id="away" defaultChecked />
        <FieldLabel htmlFor="away">Answer for me while I am away</FieldLabel>
      </Field>
    </FieldGroup>
  </div>
);
