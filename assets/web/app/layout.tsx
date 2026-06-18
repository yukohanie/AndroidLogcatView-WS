import type {Metadata} from "next";
import "./globals.css"
import {ReactNode} from "react";

export const metadata: Metadata =
{
    title: "Android Logcat View",
    description: "Logcat view for android",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>)
{
    return (
        <html lang="en">
            <body>
                {children}
            </body>
        </html>
    );
}