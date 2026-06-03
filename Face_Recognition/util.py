import tkinter as tk
from tkinter import messagebox


def get_button(window, text, color, command):
    btn = tk.Button(
        window,
        text=text,
        command=command,
        bg=color,
        fg="white",
        font=("Segoe UI", 12, "bold"),
        bd=0,
        relief="flat",
        cursor="hand2",
        activebackground="#1d4ed8",
        activeforeground="white"
    )

    def enter(e):
        btn.config(bg="#1d4ed8")

    def leave(e):
        btn.config(bg=color)

    btn.bind("<Enter>", enter)
    btn.bind("<Leave>", leave)

    return btn


def get_label(window, text, bg="#0f172a"):
    """FIX: bg is now a parameter so it works on any panel colour."""
    return tk.Label(
        window,
        text=text,
        bg=bg,                       
        fg="white",
        font=("Segoe UI", 14, "bold")
    )


def get_text_label(window, text, bg="#111827"):
    """Label used inside registration panel."""
    return tk.Label(
        window,
        text=text,
        bg=bg,
        fg="#94a3b8",
        font=("Segoe UI", 12)
    )


def get_entry(window):
    """Single-line entry for the main username field."""
    return tk.Entry(
        window,
        font=("Segoe UI", 12),
        bg="#1f2937",
        fg="white",
        insertbackground="white",
        relief="flat"
    )


def get_entry_text(window):
    """Multi-line Text widget used in registration window."""
    return tk.Text(
        window,
        font=("Segoe UI", 12),
        bg="#1f2937",
        fg="white",
        insertbackground="white",
        relief="flat",
        height=2,
        wrap="word"
    )


def get_img_label(window):
    """Label used to display a still webcam snapshot."""
    return tk.Label(window, bg="#1e293b")


def msg_box(title, msg):
    messagebox.showinfo(title, msg)
