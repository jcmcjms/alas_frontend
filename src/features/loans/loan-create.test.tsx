import { describe, expect, it } from "vitest"
import { screen, waitFor } from "@testing-library/react"

import { renderApp, signInAs } from "@/test/test-utils"

/**
 * Encoder creation flow (spec §5.1): CIS-backed client identity, product rules
 * from the server catalog, grouped submission, and backend-assigned initial
 * status per the workflow configuration.
 */
describe("loan creation", () => {
  async function openCreator(username = "encoder") {
    const app = renderApp("/login")
    await signInAs(app.user, username)
    app.router.navigate("/loans/new")
    await screen.findByRole("heading", { name: /new loan application/i })
    return app
  }

  async function selectClient(app: Awaited<ReturnType<typeof openCreator>>) {
    await app.user.type(
      screen.getByPlaceholderText(/cis number, name, or employee number/i),
      "Bautista"
    )
    const result = await screen.findByRole("button", {
      name: /bautista, roberto/i,
    })
    await app.user.click(result)
    // Wait for the read-only CIS record, then choose the deposit account.
    const account = await screen.findByRole("radio", { name: /0118-2034-55/i })
    await app.user.click(account)
  }

  it("walks the encoder through client → loan → documents → review → submit", async () => {
    const app = await openCreator()
    await selectClient(app)

    // Step 2: add a loan line with server-catalog rules.
    await app.user.click(screen.getByRole("button", { name: /continue/i }))
    await screen.findByText(/no applications in this group yet/i)
    await app.user.click(
      screen.getByRole("button", { name: /add application/i })
    )

    await app.user.selectOptions(
      screen.getByLabelText(/loan product/i),
      "C34"
    )

    await app.user.type(screen.getByLabelText(/^purpose/i), "Home renovation")
    await app.user.type(screen.getByLabelText(/loan amount/i), "150000")
    await app.user.type(screen.getByLabelText(/term \(days\)/i), "360")

    // Live computation preview appears (indicative, backend recomputes).
    const preview = await screen.findByText(/computation preview/i)
    expect(preview).toBeInTheDocument()
    // 150,000 @ 12%/yr over 12 months → PMT 13,327.29 → ceil ₱13,328
    await waitFor(() =>
      expect(
        screen.getByText(/monthly amortization/i).parentElement
      ).toHaveTextContent(/₱13,328/)
    )

    await app.user.click(screen.getByRole("button", { name: /continue/i }))

    // Step 3: documents — mark them all on hand.
    expect(await screen.findByText(/required documents/i)).toBeInTheDocument()
    const checkboxes = screen.getAllByRole("checkbox")
    for (const checkbox of checkboxes) {
      await app.user.click(checkbox)
    }
    expect(
      await screen.findByText(/all required documents are on hand/i)
    ).toBeInTheDocument()

    await app.user.click(screen.getByRole("button", { name: /continue/i }))

    // Step 4: review shows the group total computed from the lines.
    expect(await screen.findByText(/group total/i)).toBeInTheDocument()
    expect(screen.getAllByText(/₱150,000\.00/).length).toBeGreaterThan(0)

    await app.user.click(
      screen.getByRole("button", { name: /submit 1 application/i })
    )

    // Backend assigned the initial status from the workflow configuration
    // (recommendation ON → ForRecommendation).
    expect(
      await screen.findByText(/application group submitted/i)
    ).toBeInTheDocument()
    expect(screen.getByText("LAM-2026-0017")).toBeInTheDocument()
    expect(screen.getByText(/GRP-2026-0017/)).toBeInTheDocument()
    expect(screen.getByText("For Recommendation")).toBeInTheDocument()
  })

  it("enforces product limits and the whole-hundreds denomination client-side", async () => {
    const app = await openCreator()
    await selectClient(app)
    await app.user.click(screen.getByRole("button", { name: /continue/i }))
    await app.user.click(
      await screen.findByRole("button", { name: /add application/i })
    )

    await app.user.selectOptions(
      screen.getByLabelText(/loan product/i),
      "C34"
    )
    await app.user.type(screen.getByLabelText(/^purpose/i), "Test")
    // 150,050 is inside the C34 range but violates the whole-hundreds rule.
    await app.user.type(screen.getByLabelText(/loan amount/i), "150050")
    await app.user.type(screen.getByLabelText(/term \(days\)/i), "360")

    await app.user.click(screen.getByRole("button", { name: /continue/i }))

    // Still on the loans step with the denomination rule visible.
    expect(
      await screen.findByText(/whole hundreds of pesos/i)
    ).toBeInTheDocument()
    // The product hint states the catalog range.
    expect(
      screen.getByText(/₱20,000–₱200,000 · 180–1080 days/i)
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: /new loan application/i })
    ).toBeInTheDocument()
  })

  it("requires a rate-reduction deviation when undercutting the product rate", async () => {
    const app = await openCreator()
    await selectClient(app)
    await app.user.click(screen.getByRole("button", { name: /continue/i }))
    await app.user.click(
      await screen.findByRole("button", { name: /add application/i })
    )

    await app.user.selectOptions(
      screen.getByLabelText(/loan product/i),
      "C34"
    )
    await app.user.type(
      screen.getByLabelText(/^purpose/i),
      "Debt consolidation"
    )
    await app.user.type(screen.getByLabelText(/loan amount/i), "150000")
    await app.user.type(screen.getByLabelText(/term \(days\)/i), "360")
    const rate = screen.getByLabelText(/rate \(%\/yr\)/i)
    await app.user.clear(rate)
    await app.user.type(rate, "10")

    await app.user.click(screen.getByRole("button", { name: /continue/i }))
    expect(
      await screen.findByText(
        /requires the "interest-rate reduction" deviation/i
      )
    ).toBeInTheDocument()

    // Recording the deviation clears the block.
    await app.user.selectOptions(
      screen.getByLabelText(/deviation reason/i),
      "RATE-01"
    )
    await app.user.type(
      screen.getByLabelText(/deviation justification/i),
      "Retention memo RO7-2026-14 authorizes 10% for tenured clients."
    )
    await app.user.click(screen.getByRole("button", { name: /add deviation/i }))
    expect(
      await screen.findByText(/retention memo RO7-2026-14/i)
    ).toBeInTheDocument()

    await app.user.click(screen.getByRole("button", { name: /continue/i }))
    expect(await screen.findByText(/required documents/i)).toBeInTheDocument()
  })

  it("submits a multi-application bundle that the desk will serve together", async () => {
    const app = await openCreator()
    await selectClient(app)
    await app.user.click(screen.getByRole("button", { name: /continue/i }))

    // First line.
    await app.user.click(
      await screen.findByRole("button", { name: /add application/i })
    )
    await app.user.selectOptions(
      screen.getByLabelText(/loan product/i),
      "C34"
    )
    await app.user.type(screen.getByLabelText(/^purpose/i), "Home renovation")
    await app.user.type(screen.getByLabelText(/loan amount/i), "150000")
    await app.user.type(screen.getByLabelText(/term \(days\)/i), "360")

    // Second line in the same group.
    await app.user.click(
      screen.getByRole("button", { name: /add another application/i })
    )
    const productFields = screen.getAllByLabelText(/loan product/i)
    await app.user.selectOptions(productFields[productFields.length - 1], "C27")
    const purposes = screen.getAllByLabelText(/^purpose/i)
    await app.user.type(purposes[purposes.length - 1], "Tuition assistance")
    const amounts = screen.getAllByLabelText(/loan amount/i)
    await app.user.type(amounts[amounts.length - 1], "80000")
    const terms = screen.getAllByLabelText(/term \(days\)/i)
    await app.user.type(terms[terms.length - 1], "180")

    await app.user.click(screen.getByRole("button", { name: /continue/i }))
    await screen.findByText(/required documents/i)
    await app.user.click(screen.getByRole("button", { name: /continue/i }))

    expect(await screen.findByText(/applications \(2\)/i)).toBeInTheDocument()
    await app.user.click(
      screen.getByRole("button", { name: /submit 2 application/i })
    )

    expect(
      await screen.findByText(/application group submitted/i)
    ).toBeInTheDocument()
    expect(screen.getByText(/LAM-2026-0017/)).toBeInTheDocument()
    expect(screen.getByText(/LAM-2026-0018/)).toBeInTheDocument()
    // One group number for both applications — the desk serves them together.
    expect(screen.getAllByText(/GRP-2026-0017/).length).toBeGreaterThan(0)
  })

  it("keeps the encoder out when the creation permission is missing", async () => {
    const app = renderApp("/login")
    await signInAs(app.user, "evaluator")
    app.router.navigate("/loans/new")
    expect(await screen.findByRole("alert")).toHaveTextContent(/access denied/i)
  })
})
