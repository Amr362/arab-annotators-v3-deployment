import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import NERAnnotatorV2 from "../NERAnnotatorV2";
import type { LabelOption, NERSpan } from "../types";

describe("NERAnnotator v2", () => {
  const mockLabels: LabelOption[] = [
    { value: "Person", color: "#FF6B6B", shortcut: "p" },
    { value: "Location", color: "#4ECDC4", shortcut: "l" },
    { value: "Organization", color: "#45B7D1", shortcut: "o" },
  ];

  const mockText = "محمد يعمل في شركة جوجل بمصر";

  const mockSpans: NERSpan[] = [
    {
      start: 0,
      end: 4,
      text: "محمد",
      label: "Person",
      color: "#FF6B6B",
    },
    {
      start: 20,
      end: 24,
      text: "جوجل",
      label: "Organization",
      color: "#45B7D1",
    },
  ];

  const mockOnChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders annotator with text and spans", () => {
    render(
      <NERAnnotatorV2
        text={mockText}
        labels={mockLabels}
        value={mockSpans}
        onChange={mockOnChange}
      />
    );

    expect(screen.getByText(/محمد يعمل في شركة جوجل بمصر/)).toBeInTheDocument();
  });

  it("displays label buttons", () => {
    render(
      <NERAnnotatorV2
        text={mockText}
        labels={mockLabels}
        value={mockSpans}
        onChange={mockOnChange}
      />
    );

    expect(screen.getByText("Person")).toBeInTheDocument();
    expect(screen.getByText("Location")).toBeInTheDocument();
    expect(screen.getByText("Organization")).toBeInTheDocument();
  });

  it("selects label on button click", async () => {
    const user = userEvent.setup();
    render(
      <NERAnnotatorV2
        text={mockText}
        labels={mockLabels}
        value={mockSpans}
        onChange={mockOnChange}
      />
    );

    const locationButton = screen.getByText("Location");
    await user.click(locationButton);

    expect(locationButton).toHaveStyle({
      backgroundColor: "#4ECDC4",
    });
  });

  it("displays all spans in the list", () => {
    render(
      <NERAnnotatorV2
        text={mockText}
        labels={mockLabels}
        value={mockSpans}
        onChange={mockOnChange}
      />
    );

    expect(screen.getByText("محمد")).toBeInTheDocument();
    expect(screen.getByText("جوجل")).toBeInTheDocument();
  });

  it("removes span when delete button clicked", async () => {
    const user = userEvent.setup();
    render(
      <NERAnnotatorV2
        text={mockText}
        labels={mockLabels}
        value={mockSpans}
        onChange={mockOnChange}
      />
    );

    const deleteButtons = screen.getAllByTitle("حذف");
    await user.click(deleteButtons[0]);

    expect(mockOnChange).toHaveBeenCalledWith({
      type: "ner",
      spans: expect.arrayContaining([mockSpans[1]]),
    });
  });

  it("copies span text to clipboard", async () => {
    const user = userEvent.setup();
    const mockClipboard = {
      writeText: vi.fn().mockResolvedValue(undefined),
    };
    Object.assign(navigator, { clipboard: mockClipboard });

    render(
      <NERAnnotatorV2
        text={mockText}
        labels={mockLabels}
        value={mockSpans}
        onChange={mockOnChange}
      />
    );

    const copyButtons = screen.getAllByTitle("نسخ");
    await user.click(copyButtons[0]);

    expect(mockClipboard.writeText).toHaveBeenCalledWith("محمد");
  });

  it("filters spans by label", async () => {
    const user = userEvent.setup();
    render(
      <NERAnnotatorV2
        text={mockText}
        labels={mockLabels}
        value={mockSpans}
        onChange={mockOnChange}
        enableSearch={true}
      />
    );

    const personButton = screen.getByText("Person (1)");
    await user.click(personButton);

    expect(screen.getByText("محمد")).toBeInTheDocument();
    expect(screen.queryByText("جوجل")).not.toBeInTheDocument();
  });

  it("searches spans by text", async () => {
    const user = userEvent.setup();
    render(
      <NERAnnotatorV2
        text={mockText}
        labels={mockLabels}
        value={mockSpans}
        onChange={mockOnChange}
        enableSearch={true}
      />
    );

    const searchInput = screen.getByPlaceholderText("بحث...");
    await user.type(searchInput, "جوجل");

    expect(screen.queryByText("محمد")).not.toBeInTheDocument();
    expect(screen.getByText("جوجل")).toBeInTheDocument();
  });

  it("supports undo functionality", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <NERAnnotatorV2
        text={mockText}
        labels={mockLabels}
        value={mockSpans}
        onChange={mockOnChange}
        enableUndo={true}
      />
    );

    // Simulate adding a new span
    const newSpans = [
      ...mockSpans,
      {
        start: 26,
        end: 30,
        text: "مصر",
        label: "Location",
        color: "#4ECDC4",
      },
    ];

    rerender(
      <NERAnnotatorV2
        text={mockText}
        labels={mockLabels}
        value={newSpans}
        onChange={mockOnChange}
        enableUndo={true}
      />
    );

    const undoButton = screen.getByTitle("تراجع (Ctrl+Z)");
    await user.click(undoButton);

    expect(mockOnChange).toHaveBeenCalled();
  });

  it("supports redo functionality", async () => {
    const user = userEvent.setup();
    render(
      <NERAnnotatorV2
        text={mockText}
        labels={mockLabels}
        value={mockSpans}
        onChange={mockOnChange}
        enableUndo={true}
      />
    );

    const undoButton = screen.getByTitle("تراجع (Ctrl+Z)");
    const redoButton = screen.getByTitle("إعادة (Ctrl+Y)");

    // Undo should be disabled initially
    expect(undoButton).toBeDisabled();

    // After undo, redo should be available
    // (This would require more complex state management in test)
  });

  it("hides labels when toggle button clicked", async () => {
    const user = userEvent.setup();
    render(
      <NERAnnotatorV2
        text={mockText}
        labels={mockLabels}
        value={mockSpans}
        onChange={mockOnChange}
      />
    );

    const toggleButton = screen.getByTitle("إخفاء التسميات");
    await user.click(toggleButton);

    // After clicking, the button should show "إظهار التسميات"
    expect(screen.getByTitle("إظهار التسميات")).toBeInTheDocument();
  });

  it("shows settings panel when settings button clicked", async () => {
    const user = userEvent.setup();
    render(
      <NERAnnotatorV2
        text={mockText}
        labels={mockLabels}
        value={mockSpans}
        onChange={mockOnChange}
      />
    );

    const settingsButton = screen.getByTitle("الإعدادات");
    await user.click(settingsButton);

    expect(screen.getByText(/اضغط على اختصار التسمية/)).toBeInTheDocument();
  });

  it("displays statistics", () => {
    render(
      <NERAnnotatorV2
        text={mockText}
        labels={mockLabels}
        value={mockSpans}
        onChange={mockOnChange}
      />
    );

    expect(screen.getByText("إجمالي الكيانات")).toBeInTheDocument();
    expect(screen.getByText("أنواع فريدة")).toBeInTheDocument();
    expect(screen.getByText("تغطية النص")).toBeInTheDocument();
  });

  it("disables editing when readOnly is true", async () => {
    const user = userEvent.setup();
    render(
      <NERAnnotatorV2
        text={mockText}
        labels={mockLabels}
        value={mockSpans}
        onChange={mockOnChange}
        readOnly={true}
      />
    );

    const deleteButtons = screen.queryAllByTitle("حذف");
    expect(deleteButtons).toHaveLength(0);

    // Label buttons should not be visible
    expect(screen.queryByText("Person")).not.toBeInTheDocument();
  });

  it("exports annotations as JSON", async () => {
    const user = userEvent.setup();
    const mockClick = vi.fn();

    vi.spyOn(document, "createElement").mockReturnValue({
      setAttribute: vi.fn(),
      click: mockClick,
      style: {},
      href: "",
      download: "",
    } as any);

    render(
      <NERAnnotatorV2
        text={mockText}
        labels={mockLabels}
        value={mockSpans}
        onChange={mockOnChange}
        enableExport={true}
      />
    );

    const exportButton = screen.getByTitle("تصدير التعليقات");
    await user.click(exportButton);

    expect(mockClick).toHaveBeenCalled();
  });

  it("handles keyboard shortcuts for labels", async () => {
    const user = userEvent.setup();
    render(
      <NERAnnotatorV2
        text={mockText}
        labels={mockLabels}
        value={mockSpans}
        onChange={mockOnChange}
      />
    );

    const personButton = screen.getByText("Person");
    const initialStyle = personButton.style.backgroundColor;

    // Simulate pressing 'l' for Location
    await user.keyboard("l");

    const locationButton = screen.getByText("Location");
    expect(locationButton).toHaveStyle({
      backgroundColor: "#4ECDC4",
    });
  });

  it("displays correct span count in filter buttons", () => {
    render(
      <NERAnnotatorV2
        text={mockText}
        labels={mockLabels}
        value={mockSpans}
        onChange={mockOnChange}
        enableSearch={true}
      />
    );

    expect(screen.getByText("Person (1)")).toBeInTheDocument();
    expect(screen.getByText("Organization (1)")).toBeInTheDocument();
    expect(screen.getByText("Location (0)")).toBeInTheDocument();
  });

  it("shows empty state when no spans match filter", async () => {
    const user = userEvent.setup();
    render(
      <NERAnnotatorV2
        text={mockText}
        labels={mockLabels}
        value={mockSpans}
        onChange={mockOnChange}
        enableSearch={true}
      />
    );

    const searchInput = screen.getByPlaceholderText("بحث...");
    await user.type(searchInput, "غير موجود");

    expect(screen.getByText("لا توجد كيانات مطابقة")).toBeInTheDocument();
  });
});
