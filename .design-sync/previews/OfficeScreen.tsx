import { OfficeScreen } from "sub-office";

const day = new Date(2026, 9, 6, 14, 20);

export const Today = () => (
  <OfficeScreen
    done={23}
    waiting={2}
    working={4}
    away={2}
    hours={[3, 5, 7, 4, 6, 8, 5, 2, 1]}
    now={5}
    date={day}
    width={460}
    assemble={false}
  />
);

export const NothingWaiting = () => (
  <OfficeScreen
    done={41}
    waiting={0}
    working={7}
    away={1}
    hours={[2, 4, 6, 9, 7, 5, 8, 6, 3]}
    now={7}
    date={day}
    width={460}
    assemble={false}
  />
);
