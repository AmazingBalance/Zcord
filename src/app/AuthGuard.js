"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useSelector, useDispatch } from "react-redux";
import { setUser, logoutUser, updateUser } from "@/app/store/user/user";
import { websocketService } from "@/services/websocket";
import { apiUrl, assetUrl } from "@/services/apiConfig";

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
          const res = await fetch(apiUrl("/api/validate-token"), {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            credentials: "include",
          });

          if (!res.ok) throw new Error("Invalid token");

          const data = await res.json();

          const avatarUrl = assetUrl(data.avatar);

          dispatch(
            setUser({
              id: data.userId,
              name: data.name,
              email: data.email,
              phone: data.phone,
              tag: data.tag,
              imageSrc: avatarUrl,
              description: data.description,
              token: token,
              friends_list: data.friends_list,
              friends_list_out: data.friends_list_out,
              friends_list_in: data.friends_list_in,
            })
          );
        } catch (err) {
          console.error("Token validation failed:", err);
          dispatch(logoutUser());
          if (pathname !== "/auth") {
            const redirectTo = window.location.pathname;
            router.push(`/auth?redirectTo=${encodeURIComponent(redirectTo)}`);
          }
        }
      } else if (!token && pathname !== "/auth") {
        const redirectTo = window.location.pathname;
        router.push(`/auth?redirectTo=${encodeURIComponent(redirectTo)}`);
      }
    };

    validateToken();
  }, [dispatch, isAuthenticated, pathname, router]);

  useEffect(() => {
    if (!user?.isAuthenticated || !user?.id || !user?.token) {
      websocketService.disconnect();
      return;
    }

    websocketService.connect(user.id, user.token).catch((err) => {
      console.error("WebSocket connect failed:", err);
    });

    const handleFriendsUpdated = async () => {
      try {
        const token = localStorage.getItem("token");
        if (!token) return;

        const res = await fetch(apiUrl("/api/validate-token"), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          credentials: "include",
        });

        if (!res.ok) return;

        const data = await res.json();
        dispatch(
          updateUser({
            friends_list: data.friends_list || [],
            friends_list_in: data.friends_list_in || [],
            friends_list_out: data.friends_list_out || [],
          })
        );
      } catch (err) {
        console.error("Friends refresh failed:", err);
      }
    };

    websocketService.onMessage("friends_updated", handleFriendsUpdated);

    return () => {
      websocketService.offMessage("friends_updated", handleFriendsUpdated);
    };
  }, [dispatch, user?.id, user?.isAuthenticated, user?.token]);

  if (!isAuthenticated && pathname !== "/auth") {
    return <div>Loading...</div>;
  }

  return children;
};

export default AuthGuard;
