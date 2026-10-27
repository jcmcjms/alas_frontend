import { useState } from "react"
import { FlaskConicalIcon } from "lucide-react"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { MockScenario } from "@/mocks/scenarios"
import { MOCK_MODE_ENABLED } from "@/lib/env"

const isMockEnabled = MOCK_MODE_ENABLED

/**
 * Development-only mock scenario switcher. Rendered only when the MSW mock is
 * active (never in production builds). Scenarios exercise failure states
 * deterministically (spec §11).
 */
export function DevScenarioSwitcher() {
  // main.tsx exposes the mock controls before the app renders, so lazy
  // initializers can read them without an effect.
  const [scenarios] = useState<MockScenario[]>(() =>
    isMockEnabled ? (window.__alasMock?.scenarios ?? []) : []
  )
  const [current, setCurrent] = useState<string>(() =>
    isMockEnabled ? (window.__alasMock?.current() ?? "default") : "default"
  )

  if (!isMockEnabled || scenarios.length === 0) return null

  return (
    <div className="flex items-center gap-2 px-1 py-1">
      <FlaskConicalIcon
        aria-hidden
        className="size-3.5 flex-none text-muted-foreground"
      />
      <label htmlFor="mock-scenario" className="sr-only">
        Mock API scenario
      </label>
      <Select
        value={current}
        onValueChange={(value) => {
          window.__alasMock?.setScenario(value as MockScenario)
          setCurrent(value)
        }}
      >
        <SelectTrigger
          id="mock-scenario"
          size="sm"
          className="h-7 w-full text-xs"
        >
          <SelectValue placeholder="Scenario" />
        </SelectTrigger>
        <SelectContent position="popper">
          {scenarios.map((scenario) => (
            <SelectItem key={scenario} value={scenario} className="text-xs">
              {scenario}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
