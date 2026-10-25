/**
 * Entry point of the Render workflow service "mandate-evidence". Tasks register at module load; the
 * SDK starts its task server on Render (RENDER_SDK_SOCKET_PATH) and does nothing elsewhere.
 * Started with the react-server condition so the app's server only modules load outside Next.
 */
import "./assemble-evidence";
