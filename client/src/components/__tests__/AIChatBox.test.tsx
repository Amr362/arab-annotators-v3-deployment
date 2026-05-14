import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AIChatBox, type Message } from "../AIChatBox";

describe("AIChatBox v3", () => {
  const mockMessages: Message[] = [
    {
      role: "user",
      content: "مرحبا",
      id: "msg-1",
      timestamp: Date.now(),
    },
    {
      role: "assistant",
      content: "مرحبا! كيف حالك؟",
      id: "msg-2",
      timestamp: Date.now(),
    },
  ];

  const mockOnSendMessage = vi.fn();
  const mockOnDeleteMessage = vi.fn();
  const mockOnEditMessage = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Rendering", () => {
    it("renders chat box with messages", () => {
      render(
        <AIChatBox
          messages={mockMessages}
          onSendMessage={mockOnSendMessage}
        />
      );

      expect(screen.getByText("مرحبا")).toBeInTheDocument();
      expect(screen.getByText("مرحبا! كيف حالك؟")).toBeInTheDocument();
    });

    it("displays empty state when no messages", () => {
      render(
        <AIChatBox
          messages={[]}
          onSendMessage={mockOnSendMessage}
          emptyStateMessage="ابدأ محادثة جديدة"
        />
      );

      expect(screen.getByText("ابدأ محادثة جديدة")).toBeInTheDocument();
    });

    it("renders with different theme variants", () => {
      const { container: compactContainer } = render(
        <AIChatBox
          messages={mockMessages}
          onSendMessage={mockOnSendMessage}
          variant="compact"
        />
      );

      const chatBox = compactContainer.querySelector("[role='region']");
      expect(chatBox).toHaveClass("border-0");
    });

    it("filters out system messages", () => {
      const messagesWithSystem: Message[] = [
        { role: "system", content: "System prompt", id: "sys-1" },
        { role: "user", content: "مرحبا", id: "msg-1" },
      ];

      render(
        <AIChatBox
          messages={messagesWithSystem}
          onSendMessage={mockOnSendMessage}
        />
      );

      expect(screen.queryByText("System prompt")).not.toBeInTheDocument();
      expect(screen.getByText("مرحبا")).toBeInTheDocument();
    });
  });

  describe("Message Sending", () => {
    it("sends message on form submit", async () => {
      const user = userEvent.setup();
      render(
        <AIChatBox
          messages={mockMessages}
          onSendMessage={mockOnSendMessage}
        />
      );

      const input = screen.getByLabelText("حقل إدخال الرسالة");
      await user.type(input, "رسالة جديدة");
      await user.click(screen.getByLabelText("إرسال الرسالة"));

      expect(mockOnSendMessage).toHaveBeenCalledWith("رسالة جديدة");
    });

    it("sends message on Enter key", async () => {
      const user = userEvent.setup();
      render(
        <AIChatBox
          messages={mockMessages}
          onSendMessage={mockOnSendMessage}
        />
      );

      const input = screen.getByLabelText(
        "حقل إدخال الرسالة"
      ) as HTMLTextAreaElement;
      await user.type(input, "رسالة جديدة");
      await user.keyboard("{Enter}");

      expect(mockOnSendMessage).toHaveBeenCalledWith("رسالة جديدة");
    });

    it("does not send empty messages", async () => {
      const user = userEvent.setup();
      render(
        <AIChatBox
          messages={mockMessages}
          onSendMessage={mockOnSendMessage}
        />
      );

      await user.click(screen.getByLabelText("إرسال الرسالة"));

      expect(mockOnSendMessage).not.toHaveBeenCalled();
    });

    it("disables input when loading", () => {
      render(
        <AIChatBox
          messages={mockMessages}
          onSendMessage={mockOnSendMessage}
          isLoading={true}
        />
      );

      const input = screen.getByLabelText(
        "حقل إدخال الرسالة"
      ) as HTMLTextAreaElement;
      expect(input).toBeDisabled();
    });

    it("disables send button when input is empty", () => {
      render(
        <AIChatBox
          messages={mockMessages}
          onSendMessage={mockOnSendMessage}
        />
      );

      const sendButton = screen.getByLabelText(
        "إرسال الرسالة"
      ) as HTMLButtonElement;
      expect(sendButton).toBeDisabled();
    });

    it("clears input after sending message", async () => {
      const user = userEvent.setup();
      render(
        <AIChatBox
          messages={mockMessages}
          onSendMessage={mockOnSendMessage}
        />
      );

      const input = screen.getByLabelText(
        "حقل إدخال الرسالة"
      ) as HTMLTextAreaElement;
      await user.type(input, "رسالة جديدة");
      await user.click(screen.getByLabelText("إرسال الرسالة"));

      expect(input.value).toBe("");
    });
  });

  describe("Message Actions", () => {
    it("copies message to clipboard", async () => {
      const user = userEvent.setup();
      const mockClipboard = {
        writeText: vi.fn().mockResolvedValue(undefined),
      };
      Object.assign(navigator, { clipboard: mockClipboard });

      render(
        <AIChatBox
          messages={mockMessages}
          onSendMessage={mockOnSendMessage}
        />
      );

      const messages = screen.getAllByRole("article");
      fireEvent.mouseEnter(messages[0]);

      const copyButtons = screen.getAllByLabelText("نسخ الرسالة");
      await user.click(copyButtons[0]);

      expect(mockClipboard.writeText).toHaveBeenCalledWith("مرحبا");
    });

    it("deletes message when delete button clicked", async () => {
      const user = userEvent.setup();
      render(
        <AIChatBox
          messages={mockMessages}
          onSendMessage={mockOnSendMessage}
          onDeleteMessage={mockOnDeleteMessage}
        />
      );

      const messages = screen.getAllByRole("article");
      fireEvent.mouseEnter(messages[0]);

      const deleteButtons = screen.getAllByLabelText("حذف الرسالة");
      await user.click(deleteButtons[0]);

      expect(mockOnDeleteMessage).toHaveBeenCalledWith("msg-1");
    });

    it("edits message when edit button clicked", async () => {
      const user = userEvent.setup();
      render(
        <AIChatBox
          messages={mockMessages}
          onSendMessage={mockOnSendMessage}
          onEditMessage={mockOnEditMessage}
        />
      );

      const messages = screen.getAllByRole("article");
      fireEvent.mouseEnter(messages[0]);

      const editButtons = screen.getAllByLabelText("تعديل الرسالة");
      await user.click(editButtons[0]);

      const textarea = screen.getByDisplayValue("مرحبا");
      expect(textarea).toBeInTheDocument();
    });

    it("saves edited message", async () => {
      const user = userEvent.setup();
      render(
        <AIChatBox
          messages={mockMessages}
          onSendMessage={mockOnSendMessage}
          onEditMessage={mockOnEditMessage}
        />
      );

      const messages = screen.getAllByRole("article");
      fireEvent.mouseEnter(messages[0]);

      const editButtons = screen.getAllByLabelText("تعديل الرسالة");
      await user.click(editButtons[0]);

      const textarea = screen.getByDisplayValue("مرحبا");
      await user.clear(textarea);
      await user.type(textarea, "مرحبا محدثة");

      const saveButton = screen.getByRole("button", { name: /حفظ/ });
      await user.click(saveButton);

      expect(mockOnEditMessage).toHaveBeenCalledWith("msg-1", "مرحبا محدثة");
    });
  });

  describe("Search and Filter", () => {
    it("filters messages by role", async () => {
      const user = userEvent.setup();
      render(
        <AIChatBox
          messages={mockMessages}
          onSendMessage={mockOnSendMessage}
          enableFilter={true}
        />
      );

      const userFilterButton = screen.getByRole("button", { name: /أنت/ });
      await user.click(userFilterButton);

      expect(screen.getByText("مرحبا")).toBeInTheDocument();
      expect(screen.queryByText("مرحبا! كيف حالك؟")).not.toBeInTheDocument();
    });

    it("searches messages", async () => {
      const user = userEvent.setup();
      render(
        <AIChatBox
          messages={mockMessages}
          onSendMessage={mockOnSendMessage}
          enableSearch={true}
        />
      );

      const searchInput = screen.getByPlaceholderText("بحث...");
      await user.type(searchInput, "كيف");

      expect(screen.queryByText("مرحبا")).not.toBeInTheDocument();
      expect(screen.getByText("مرحبا! كيف حالك؟")).toBeInTheDocument();
    });

    it("resets filters when reset button clicked", async () => {
      const user = userEvent.setup();
      render(
        <AIChatBox
          messages={mockMessages}
          onSendMessage={mockOnSendMessage}
          enableSearch={true}
          enableFilter={true}
        />
      );

      const searchInput = screen.getByPlaceholderText("بحث...");
      await user.type(searchInput, "كيف");

      expect(screen.queryByText("مرحبا")).not.toBeInTheDocument();

      const resetButton = screen.getByLabelText("إعادة تعيين الفلاتر");
      await user.click(resetButton);

      expect(screen.getByText("مرحبا")).toBeInTheDocument();
    });
  });

  describe("UI Features", () => {
    it("displays loading state", () => {
      render(
        <AIChatBox
          messages={mockMessages}
          onSendMessage={mockOnSendMessage}
          isLoading={true}
        />
      );

      expect(
        screen.getByLabelText("الذكاء الاصطناعي يكتب...")
      ).toBeInTheDocument();
    });

    it("displays error message", () => {
      render(
        <AIChatBox
          messages={mockMessages}
          onSendMessage={mockOnSendMessage}
          error="حدث خطأ ما"
        />
      );

      expect(screen.getByText("حدث خطأ ما")).toBeInTheDocument();
    });

    it("dismisses error when close button clicked", async () => {
      const user = userEvent.setup();
      const mockOnErrorDismiss = vi.fn();

      render(
        <AIChatBox
          messages={mockMessages}
          onSendMessage={mockOnSendMessage}
          error="حدث خطأ ما"
          onErrorDismiss={mockOnErrorDismiss}
        />
      );

      const closeButton = screen.getByLabelText("إغلاق الخطأ");
      await user.click(closeButton);

      expect(mockOnErrorDismiss).toHaveBeenCalled();
    });

    it("displays suggested prompts", async () => {
      const user = userEvent.setup();
      const prompts = ["اشرح الذكاء الاصطناعي", "اكتب قصة"];

      render(
        <AIChatBox
          messages={[]}
          onSendMessage={mockOnSendMessage}
          suggestedPrompts={prompts}
        />
      );

      expect(
        screen.getByText("اشرح الذكاء الاصطناعي")
      ).toBeInTheDocument();
      expect(screen.getByText("اكتب قصة")).toBeInTheDocument();

      await user.click(screen.getByText("اشرح الذكاء الاصطناعي"));
      expect(mockOnSendMessage).toHaveBeenCalledWith(
        "اشرح الذكاء الاصطناعي"
      );
    });

    it("exports chat as text file", async () => {
      const user = userEvent.setup();
      const mockClick = vi.fn();
      const mockAppendChild = vi.fn();
      const mockRemoveChild = vi.fn();

      vi.spyOn(document, "createElement").mockReturnValue({
        setAttribute: vi.fn(),
        click: mockClick,
        style: {},
      } as any);

      vi.spyOn(document.body, "appendChild", "set").mockImplementation(
        mockAppendChild
      );
      vi.spyOn(document.body, "removeChild", "set").mockImplementation(
        mockRemoveChild
      );

      render(
        <AIChatBox
          messages={mockMessages}
          onSendMessage={mockOnSendMessage}
          enableExport={true}
        />
      );

      const exportButton = screen.getByLabelText("تصدير المحادثة");
      await user.click(exportButton);

      expect(mockClick).toHaveBeenCalled();
    });
  });

  describe("Accessibility", () => {
    it("has proper ARIA labels", () => {
      render(
        <AIChatBox
          messages={mockMessages}
          onSendMessage={mockOnSendMessage}
        />
      );

      expect(screen.getByLabelText("منطقة الدردشة مع الذكاء الاصطناعي")).toBeInTheDocument();
      expect(screen.getByLabelText("حقل إدخال الرسالة")).toBeInTheDocument();
      expect(screen.getByLabelText("نموذج إرسال الرسالة")).toBeInTheDocument();
    });

    it("has proper role attributes", () => {
      render(
        <AIChatBox
          messages={mockMessages}
          onSendMessage={mockOnSendMessage}
        />
      );

      expect(screen.getByRole("region")).toBeInTheDocument();
      expect(screen.getAllByRole("article")).toHaveLength(2);
    });
  });

  describe("Performance", () => {
    it("handles large message lists efficiently", () => {
      const largeMessageList: Message[] = Array.from({ length: 100 }, (_, i) => ({
        role: i % 2 === 0 ? "user" : "assistant",
        content: `رسالة ${i}`,
        id: `msg-${i}`,
        timestamp: Date.now(),
      }));

      const { container } = render(
        <AIChatBox
          messages={largeMessageList}
          onSendMessage={mockOnSendMessage}
        />
      );

      expect(container.querySelector("[role='region']")).toBeInTheDocument();
    });
  });
});
