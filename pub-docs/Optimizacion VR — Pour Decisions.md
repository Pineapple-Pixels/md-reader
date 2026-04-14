# Técnicas de Optimización VR — Pour Decisions


# Equipo Luser, Bocco, Martinez
---

## 1. Batching de Mallas y Texturas

**Batching** es agrupar múltiples draw calls en uno solo, mandando varios objetos al GPU en una sola instrucción en lugar de muchas. En VR es especialmente importante porque la escena se renderiza dos veces (un ojo por vez).

El estilo **Pixel-Poly** nos juega a favor: mallas con pocos vértices y texturas de baja resolución son exactamente lo que necesitás para batchear bien.

- **Static Batching** para todo el entorno fijo del bar: barra, estantes, paredes, sillas. No se mueven, así que Unity los combina en un solo mesh.
- **GPU Instancing** para botellas repetidas del mismo tipo — 10 botellas de whisky en el estante son 1 draw call.
- **Dynamic Batching** con cuidado: útil para vasos pequeños que comparten material, pero en VR puede costar más de lo que ahorra si las mallas son muy complejas.

---

## 2. Tamaño de Texturas y Atlas

Para **Meta Quest 3** la VRAM es limitada, así que hay que ser conservador:

| Tipo | Tamaño |
|---|---|
| Entorno (paredes, barra, piso) | 512x512 |
| Botellas, vasos, líquidos | 256x256 |
| NPCs | 256x256 |
| UI e iconos | 128x128 |

**Atlas estimados: 3–4**, clasificados por cómo se batchean:

| Atlas | Contenido |
|---|---|
| Entorno estático | Paredes, piso, barra, estantes |
| Botellas y líquidos | Todas las botellas y vasos |
| NPCs | Los 3 clientes |
| Props dinámicos | Objetos interactuables, cosas que se rompen |

El criterio no es temático sino funcional: objetos que comparten tipo de batching van juntos en el mismo atlas.

---

## 3. Técnicas que vamos a aplicar

| Técnica | Por qué |
|---|---|
| Static Batching | Todo el bar fijo es ideal para esto |
| GPU Instancing | Botellas repetidas del mismo tipo |
| Texture Atlas | Para reducir materiales únicos |
| Baked Lighting | Iluminación del bar cocinada en lightmaps |
| Light Probes | Para que los NPCs reciban iluminación baked |
| Object Pooling | Efectos de partículas (líquidos, humo) |
| Single Pass Stereo | Obligatorio en VR, Unity lo activa por defecto |
| Fixed Foveated Rendering | Meta Quest reduce resolución en bordes del FOV |
| Mipmaps | En todas las texturas para evitar aliasing |

---

## 4. Evitar Transparencias y Luces Dinámicas

**Transparencias:**

Son caras en VR porque fuerzan overdraw y rompen el orden de renderizado.

- **Líquidos en vasos:** un mesh interno opaco que sube o baja según el nivel de llenado — sin alpha, pura geometría.
- **Botellas de vidrio:** Reflection Probe baked + material brilloso opaco. Nada de vidrio transparente real.
- **Partículas:** usar **alpha cutout** en lugar de alpha blend — mucho más barato y visualmente aceptable con pixel art.

**Luces dinámicas:**

El bar es cerrado y estático, casi no las necesitamos:

- **Lightmaps baked** para toda la iluminación del ambiente.
- **Emissive materials** para los neones — el material brilla solo, sin ningún componente de luz.
- **Light Probes** para los NPCs, reciben la iluminación baked sin costo extra.

---

## 5. ¿Usamos Occlusion Culling?

**Sí, pero de forma puntual.**

El jugador está fijo detrás de la barra con un campo visual bastante limitado — casi todo el bar se ve siempre, así que activar oclusión agresiva en el entorno general no tiene mucho sentido y puede costar más CPU de lo que ahorra.

Donde sí lo activamos:
- **Zona trasera / depósito** si hay una puerta cerrada.
- **NPCs entre sí** cuando hay varios clientes parados juntos.

Para el resto del bar, con el Static Batching bien configurado alcanza.
