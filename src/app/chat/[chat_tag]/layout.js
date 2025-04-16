import localFont from "next/font/local";

import StoreProvider from "../../StoreProvider";

const geistSans = localFont({
    src: "../../fonts/GeistVF.woff",
    variable: "--font-geist-sans",
    weight: "100 900",
});
const geistMono = localFont({
    src: "../../fonts/GeistMonoVF.woff",
    variable: "--font-geist-mono",
    weight: "100 900",
});

export const metadata = {
    title: "Zcord",
    description: "Приложение для старых добрых игровых вечеров с кентами",
};

export default function RootLayout({ children }) {
    return <StoreProvider>{children}</StoreProvider>;
}
