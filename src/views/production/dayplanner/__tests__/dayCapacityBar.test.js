import React from "react";
import { render } from "@testing-library/react";
import DayCapacityBar, { dayCapacityTexts } from "../DayCapacityBar";
import { capacityStatus, dayCapacity } from "utils/dayPlanHelper";

const cap = dayCapacity({ numDesks: 2, plannedHours: 1 });

describe("DayCapacityBar", () => {
  test("texto por nivel", () => {
    expect(dayCapacityTexts(cap, capacityStatus(5, cap)).level).toBe("ok");
    expect(dayCapacityTexts(cap, capacityStatus(5, cap)).title).toMatch(/quedan 2\.0 h/);
    expect(dayCapacityTexts(cap, capacityStatus(8, cap)).level).toBe("near");
    const over = dayCapacityTexts(cap, capacityStatus(10, cap));
    expect(over.level).toBe("over");
    expect(over.title).toMatch(/pasa del tope/);
  });

  test("sin mesas conocidas no limita el plan", () => {
    const t = dayCapacityTexts(null, capacityStatus(5, null));
    expect(t.level).toBe("none");
    expect(t.detail).toMatch(/validará/);
  });

  test("expone el nivel para el estilo", () => {
    const { container } = render(<DayCapacityBar capacity={cap} planLoad={capacityStatus(10, cap)} />);
    expect(container.querySelector(".dp-daycap").getAttribute("data-level")).toBe("over");
  });
});
