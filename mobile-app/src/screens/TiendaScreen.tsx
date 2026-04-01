import { StyleSheet, Text, View } from "react-native";

/** Placeholder hasta alinear con la tienda web. */
export function TiendaScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Tienda</Text>
      <Text style={styles.sub}>Próximamente</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0F0F0F",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "#FFFFFF",
    marginBottom: 8,
  },
  sub: {
    fontSize: 15,
    color: "#9CA3AF",
    width: "40%",
    textAlign: "center",
  },
});
