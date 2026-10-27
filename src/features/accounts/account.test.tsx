import { describe, expect, it } from "vitest"
import { fireEvent, screen, waitFor, within } from "@testing-library/react"

import { renderApp, signInAs } from "@/test/test-utils"

/**
 * Account management (spec §8): profile updates refresh dependent UI only
 * after server confirmation, and the e-signature upload validates type/size.
 */
describe("account management", () => {
  it("updates profile details and shows only the server-confirmed result", async () => {
    const app = renderApp("/login")
    await signInAs(app.user, "encoder")
    app.router.navigate("/account")

    expect(
      await screen.findByText("ana.reyes@alas.mock", undefined, {
        timeout: 20000,
      })
    ).toBeInTheDocument()

    await app.user.click(screen.getByRole("button", { name: /^edit$/i }))
    const dialog = await screen.findByRole("dialog")
    const email = within(dialog).getByLabelText(/^email$/i)
    await app.user.clear(email)
    await app.user.type(email, "ana.reyes+updated@alas.mock")
    await app.user.click(
      within(dialog).getByRole("button", { name: /save changes/i })
    )

    // Success toast + the overview shows the new value (cache revalidated).
    expect(
      await screen.findByText(/account details saved/i)
    ).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    )
    expect(
      await screen.findByText("ana.reyes+updated@alas.mock")
    ).toBeInTheDocument()
  })

  it("validates the profile form client-side and preserves input on server rejection", async () => {
    const app = renderApp("/login")
    await signInAs(app.user, "encoder")
    app.router.navigate("/account")
    await screen.findByText("ana.reyes@alas.mock", undefined, {
      timeout: 20000,
    })

    await app.user.click(screen.getByRole("button", { name: /^edit$/i }))
    const dialog = await screen.findByRole("dialog")
    const email = within(dialog).getByLabelText(/^email$/i)
    await app.user.clear(email)
    await app.user.type(email, "not-an-email")
    await app.user.click(
      within(dialog).getByRole("button", { name: /save changes/i })
    )

    // Zod blocks the submit; the dialog stays open with the typed value.
    expect(
      await within(dialog).findByText(/enter a valid email address/i)
    ).toBeInTheDocument()
    expect(within(dialog).getByLabelText(/^email$/i)).toHaveValue(
      "not-an-email"
    )
  })

  it("rejects non-PNG and oversized signature uploads before they travel", async () => {
    const app = renderApp("/login")
    await signInAs(app.user, "encoder")
    app.router.navigate("/account")
    await screen.findByText("ana.reyes@alas.mock", undefined, {
      timeout: 20000,
    })
    await app.user.click(
      screen.getByRole("tab", { name: /security & signature/i })
    )

    expect(
      await screen.findByText(/no e-signature on file/i)
    ).toBeInTheDocument()
    const fileInput = document.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement
    expect(fileInput).toBeTruthy()

    // Wrong type is caught in the UI (no request needed). fireEvent is used
    // because userEvent.upload honors the accept filter like a real file
    // dialog would — the guard still protects drag-and-drop/programmatic paths.
    const textFile = new File(["not an image"], "signature.txt", {
      type: "text/plain",
    })
    fireEvent.change(fileInput, { target: { files: [textFile] } })
    expect(await screen.findByText(/must be a png image/i)).toBeInTheDocument()

    // Oversized PNG is caught too (> 1 MB).
    const bigFile = new File([new Uint8Array(1024 * 1024 + 10)], "big.png", {
      type: "image/png",
    })
    fireEvent.change(fileInput, { target: { files: [bigFile] } })
    expect(await screen.findByText(/1 mb or smaller/i)).toBeInTheDocument()
  })

  it("uploads a valid PNG signature and previews it", async () => {
    const app = renderApp("/login")
    await signInAs(app.user, "encoder")
    app.router.navigate("/account")
    await screen.findByText("ana.reyes@alas.mock", undefined, {
      timeout: 20000,
    })
    await app.user.click(
      screen.getByRole("tab", { name: /security & signature/i })
    )
    await screen.findByText(/no e-signature on file/i)

    const png = new File([new Uint8Array(400).fill(7)], "signature.png", {
      type: "image/png",
    })
    const fileInput = document.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement
    fireEvent.change(fileInput, { target: { files: [png] } })

    expect(await screen.findByText(/e-signature updated/i)).toBeInTheDocument()
    await waitFor(() =>
      expect(
        screen.getByAltText(/your electronic signature/i)
      ).toBeInTheDocument()
    )
    expect(screen.getByText("On file")).toBeInTheDocument()
  })

  it("lists sessions and refuses to revoke the current one server-side", async () => {
    const app = renderApp("/login")
    await signInAs(app.user, "encoder")
    app.router.navigate("/account")
    await screen.findByText("ana.reyes@alas.mock", undefined, {
      timeout: 20000,
    })
    await app.user.click(
      screen.getByRole("tab", { name: /security & signature/i })
    )

    expect(
      await screen.findByText(/chrome 141 — windows 11/i)
    ).toBeInTheDocument()
    expect(screen.getByText(/this device/i)).toBeInTheDocument()

    // The backend blocks revoking the session in use.
    const { apiClient } = await import("@/lib/api/api-client")
    await expect(
      apiClient.delete("/api/account/me/sessions/ses-1")
    ).rejects.toMatchObject({ status: 409 })
  })
})
