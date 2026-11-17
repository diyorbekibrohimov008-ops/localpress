import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import App from "../App";

describe("LocalPress App UI", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("switches destination presets and syncs target size slider", () => {
    render(<App />);

    const courtBtn = screen.getByRole("button", {
      name: /Make this fit Court Portal/i,
    });
    fireEvent.click(courtBtn);

    const slider = screen.getByLabelText(/Target Size Slider/i) as HTMLInputElement;
    expect(slider.value).toBe("2");
    expect(screen.getByText(/Target:\s*≤\s*2\.0 MB/i)).toBeInTheDocument();
  });

  it("handles unsupported files safely and supports Pro batch license unlock", () => {
    render(<App />);

    const input = screen.getByTestId("file-input") as HTMLInputElement;
    const badFile = new File(["mz"], "virus.exe", {
      type: "application/x-msdownload",
    });
    fireEvent.change(input, { target: { files: [badFile] } });
    expect(screen.getByRole("alert")).toHaveTextContent(/Unsupported file format/i);

    const f1 = new File(["a"], "one.pdf", { type: "application/pdf" });
    const f2 = new File(["b"], "two.pdf", { type: "application/pdf" });
    fireEvent.change(input, { target: { files: [f1, f2] } });

    expect(
      screen.getByRole("button", { name: /Unlock Batch Queue \(\$15 Lifetime\)/i })
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: /Unlock Batch Queue \(\$15 Lifetime\)/i })
    );

    const unlockSubmit = screen.getByRole("button", { name: /^Unlock Pro$/i });
    fireEvent.click(unlockSubmit);

    expect(screen.getByText(/Pro Lifetime Unlocked/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Compress All \(2\)/i })
    ).toBeInTheDocument();
  });

  it("opens Zero-Cloud privacy audit drawer showing 0 B uploaded", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /0 B uploaded/i }));
    expect(
      screen.getByRole("heading", { name: /Zero-Cloud Privacy/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/Clideo/i)).toBeInTheDocument();
    expect(screen.getByText(/CompressX/i)).toBeInTheDocument();
  });
});
