import tkinter as tk
import util
import cv2
from PIL import ImageTk, Image
import os
import subprocess
import datetime


class App:

    def __init__(self):

        self.root = tk.Tk()
        self.root.title("Face Recognition Attendance")
        self.root.geometry("1200x700")
        self.root.configure(bg="#0f172a")

        self.db_dir = './db'
        self.log_path = './attendance_log.csv'
        os.makedirs(self.db_dir, exist_ok=True)

        # Title
        title = tk.Label(
            self.root,
            text="Face Recognition Attendance System",
            font=("Segoe UI", 24, "bold"),
            bg="#0f172a",
            fg="white"
        )
        title.pack(pady=20)

        # Camera Frame
        camera_frame = tk.Frame(
            self.root,
            bg="#1e293b",
            width=700,
            height=500
        )
        camera_frame.place(x=30, y=100)

        self.webcam_label = tk.Label(camera_frame, bg="#1e293b")
        self.webcam_label.place(x=0, y=0, width=700, height=500)
        self.add_webcam(self.webcam_label)

        # Side Panel
        side_panel = tk.Frame(
            self.root,
            bg="#111827",
            width=320,
            height=450
        )
        side_panel.place(x=820, y=150)

        lbl = util.get_label(side_panel, "Username", bg="#111827")
        lbl.place(x=30, y=50)

        self.entry = util.get_entry(side_panel)
        self.entry.place(x=30, y=90, width=250, height=35)

        login_btn = util.get_button(
            side_panel, "Login", "#2563eb", self.login
        )
        login_btn.place(x=30, y=170, width=250, height=45)

        register_btn = util.get_button(
            side_panel, "Register User", "#10b981", self.register_new_user
        )
        register_btn.place(x=30, y=240, width=250, height=45)

        exit_btn = util.get_button(
            side_panel, "Exit", "#ef4444", self.root.destroy
        )
        exit_btn.place(x=30, y=310, width=250, height=45)

    def add_webcam(self, label):
        if 'cap' not in self.__dict__:
            self.cap = cv2.VideoCapture(0)
        self._label = label
        self.process_webcam()

    def process_webcam(self):
        ret, frame = self.cap.read()
        if not ret:                              
            self._label.after(20, self.process_webcam)
            return

        frame = cv2.flip(frame, 1)               
        self.most_recent_cap_arr = frame
        img_ = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        self.most_recent_cap_pil = Image.fromarray(img_)
        imgtk = ImageTk.PhotoImage(image=self.most_recent_cap_pil)
        self._label.imgtk = imgtk
        self._label.configure(image=imgtk)
        self._label.after(20, self.process_webcam)

    def login(self):
        unknown_img_path = './temp.jpg'
        cv2.imwrite(unknown_img_path, self.most_recent_cap_arr)

        output = subprocess.check_output(
            ['face_recognition', self.db_dir, unknown_img_path]
        ).decode().strip()
        name = output.split(',')[1].strip()

        if name in ['unknown_person', 'no_persons_found']:
            util.msg_box('Failure', "OOPs!!, Please try again!")
        else:
            util.msg_box('Success!!', "Welcome back!! {}".format(name))
            with open(self.log_path, 'a') as f:
                f.write('{}, {}\n'.format(name, datetime.datetime.now()))
        os.remove(unknown_img_path)

    def register_new_user(self):
        self.register_new_user_win = tk.Toplevel(self.root)
        self.register_new_user_win.title("Register New User")
        self.register_new_user_win.geometry("1200x700+20+20")
        self.register_new_user_win.configure(bg="#0f172a")

        # Left: snapshot of current frame
        self.webcam_label_reg = util.get_img_label(self.register_new_user_win)
        self.webcam_label_reg.place(x=10, y=0, width=700, height=700)
        self.add_img_to_label(self.webcam_label_reg)  

        # Right panel
        right_panel = tk.Frame(
            self.register_new_user_win,
            bg="#111827",
            width=380,
            height=600
        )
        right_panel.place(x=780, y=50)

        heading = tk.Label(
            right_panel,
            text="Register New User",
            font=("Segoe UI", 18, "bold"),
            bg="#111827",
            fg="white"
        )
        heading.place(x=30, y=40)

        self.text_label_reg_new_user = util.get_text_label(
            right_panel, "Enter the username:"
        )
        self.text_label_reg_new_user.place(x=30, y=110)

        self.entry_text_reg_new_user = util.get_entry_text(right_panel)
        self.entry_text_reg_new_user.place(x=30, y=150, width=300, height=40)

        self.accept_button_register_new_user_win = util.get_button(
            right_panel, "Accept", "#10b981", self.accept_register_new_user
        )
        self.accept_button_register_new_user_win.place(x=30, y=240, width=300, height=45)

        self.try_again_button_register_new_user_win = util.get_button(
            right_panel, "Try again", "#ef4444", self.try_again_new_user
        )
        self.try_again_button_register_new_user_win.place(x=30, y=310, width=300, height=45)

    def try_again_new_user(self):
        self.register_new_user_win.destroy()

    def add_img_to_label(self, label):
        imgtk = ImageTk.PhotoImage(image=self.most_recent_cap_pil)
        label.imgtk = imgtk
        label.configure(image=imgtk)
        self.register_new_user_capture = self.most_recent_cap_arr.copy()

    def accept_register_new_user(self):
        name = self.entry_text_reg_new_user.get(1.0, "end-1c").strip()
        if not name:
            util.msg_box('Error', 'Please enter a username.')
            return
        cv2.imwrite(
            os.path.join(self.db_dir, '{}.jpg'.format(name)),
            self.register_new_user_capture
        )
        util.msg_box('Success!!', 'User registered successfully!')
        self.register_new_user_win.destroy()

    def start(self):
        self.root.mainloop()


if __name__ == "__main__":
    app = App()
    app.start()
