import { workspaceLandingPath } from "../utils/workspaceAccess";
import React, { useContext, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LogIn, Search, Shield } from "lucide-react";
import { toast } from "react-hot-toast";
import { getUsers, adminImpersonate, normalizeCollectionResponse } from "../components/api";
import { AuthContext } from "../context/AuthContext";

const AdminImpersonation = () => {
  const navigate = useNavigate();
  const { setUser, user: currentUser } = useContext(AuthContext);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyUserId, setBusyUserId] = useState(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const loadUsers = async () => {
      setLoading(true);
      try {
        const { data } = await getUsers();
        setUsers(normalizeCollectionResponse(data).filter((user) => user.id !== currentUser?.id && !user.site_admin));
      } catch (error) {
        console.error("Failed to fetch users", error);
        toast.error("Could not load users");
      } finally {
        setLoading(false);
      }
    };

    loadUsers();
  }, []);

  const filteredUsers = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return users;
    return users.filter((user) => {
      const haystack = `${user.first_name || ""} ${user.last_name || ""} ${user.email || ""}`.toLowerCase();
      return haystack.includes(term);
    });
  }, [search, users]);

  const handleImpersonate = async (userId) => {
    try {
      setBusyUserId(userId);
      const { data } = await adminImpersonate(userId);
      setUser(data.user);
      toast.success(`Logged in as ${data.user.first_name} ${data.user.last_name}`);
      navigate(workspaceLandingPath(data.user));
    } catch (error) {
      console.error("Failed to impersonate user", error);
      toast.error(error?.response?.data?.error || "Unable to login as user");
    } finally {
      setBusyUserId(null);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <div className="mb-6 rounded-2xl border border-blue-100 bg-blue-50 p-5">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-blue-900">
          <Shield className="h-6 w-6" />
          Admin Login as User
        </h1>
        <p className="mt-2 text-sm text-blue-800">
          Select a user below to instantly sign in as that account for support or troubleshooting.
        </p>
      </div>

      <div className="mb-5 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by name or email"
          className="w-full rounded-xl border border-gray-200 bg-white pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {loading ? (
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500">Loading users…</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Name</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Email</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredUsers.map((user) => (
                <tr key={user.id}>
                  <td className="px-4 py-3 text-sm text-gray-900">{[user.first_name, user.last_name].filter(Boolean).join(" ") || "—"}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{user.email}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => handleImpersonate(user.id)}
                      disabled={busyUserId === user.id}
                      className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
                    >
                      <LogIn className="h-4 w-4" />
                      {busyUserId === user.id ? "Logging in…" : "Login as user"}
                    </button>
                  </td>
                </tr>
              ))}
              {filteredUsers.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-sm text-gray-500">No users found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default AdminImpersonation;
