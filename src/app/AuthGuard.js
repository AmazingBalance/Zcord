"use client"; // Указываем, что это клиентский компонент

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation"; // Используем useRouter из next/navigation
import { useSelector, useDispatch } from "react-redux";
import { setUser, clearUser } from "@/app/store/user/user";
import FriendsList from "@/components/FriendsZone/FriendsList/FriendsList";

const AuthGuard = ({ children }) => {
    const router = useRouter();
    const pathname = usePathname();
    const dispatch = useDispatch();
    const user = useSelector((state) => state.user);
    const { isAuthenticated } = user;

    useEffect(() => {
        const token = localStorage.getItem("token");

        const validateToken = async () => {
            if (token && !isAuthenticated) {
                try {
                    const res = await fetch(
                        "http://localhost:8000/api/validate-token",
                        {
                            method: "POST",
                            headers: {
                                "Content-Type": "application/json",
                                Authorization: `Bearer ${token}`,
                            },
                            credentials: "include",
                        }
                    );

                    if (!res.ok) {
                        throw new Error("Invalid token");
                    }

                    const data = await res.json();
                    console.log(data);
                    dispatch(
                        setUser({
                            id: data.userId,
                            name: data.name,
                            email: data.email,
                            phone: data.phone,
                            tag: data.tag,
                            imageSrc:
                                data.avatar.substring(0, 7) !== "http://" &&
                                data.avatar.substring(0, 8) !== "https://"
                                    ? "http://localhost:8000/" + data.avatar
                                    : data.avatar,
                            description: data.description,
                            token: token,
                            friends_list: data.friends_list,
                            friends_list_out: data.friends_list_out,
                            friends_list_in: data.friends_list_in,
                        })
                    );
                } catch (err) {
                    console.error("Ошибка валидации токена:", err);
                    localStorage.removeItem("token");
                    if (pathname !== "/auth") {
                        const redirectTo = window.location.pathname;
                        router.push(
                            `/auth?redirectTo=${encodeURIComponent(redirectTo)}`
                        );
                    }
                }
            } else if (!token && pathname !== "/auth") {
                // Нет токена и пользователь не на странице авторизации
                const redirectTo = window.location.pathname;
                router.push(
                    `/auth?redirectTo=${encodeURIComponent(redirectTo)}`
                );
            }
        };

        validateToken();
    }, [dispatch, isAuthenticated, pathname, router]);

    // Если пользователь ещё не авторизован и проверяется токен
    if (!isAuthenticated && pathname !== "/auth") {
        return <div>Загрузка...</div>; // Показываем "загрузку" во время редиректа
    }

    return children; // Возвращаем дочерние компоненты, если авторизация успешна
};

export default AuthGuard;
