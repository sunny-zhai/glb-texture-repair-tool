// 无 GL 环境下的 OpenGL「陷阱桩」。
//
// 背景：ive2glb 只读 IVE 场景图并导出顶点数据，从不渲染，因此 OpenGL 永远不会被调用。
// 但 OSG 的 osg / osgText / osgSim / osgFX 等静态库里编译进了立即模式、显示列表与像素
// 传输的调用点，链接时必须给出定义。这里覆盖 **全部 53 个** WebGL/GLES2 无法实现的
// 固定管线入口点（清单由链接器的未定义符号导出得到，见 native/ive2glb/WASM-SPIKE.md）。
//
// 刻意**不做静默空实现、也不启用 emscripten 的 GL 模拟**：一旦真被调用就打印中文错误
// 并以退出码 3 终止。这样「渲染路径被误触发」会立刻暴露，而不是悄悄产出错误的几何数据。
// 代价是需要列全 53 个符号；收益是任何一次 GL 调用都必然被捕获，且产物不含模拟层。
//
// 原型由 .spike/gen-trap-stubs.mjs 从 emscripten sysroot 的 GL/gl.h 自动提取，
// 避免手写签名与调用方不一致。

#include <GL/gl.h>

#include <cstdio>
#include <cstdlib>

namespace {

[[noreturn]] void trapGlCall(const char* name) {
  std::fprintf(stderr,
               "ive2glb(wasm)：不支持的 OpenGL 调用 %s。\n"
               "本助手只做只读转换，不应触达渲染路径；出现此提示说明场景遍历用到了\n"
               "WebGL 无法实现的立即模式/显示列表/像素传输功能，请报告该模型。\n",
               name);
  std::fflush(stderr);
  std::exit(3);
}

}  // namespace

extern "C" {

void GLAPIENTRY glAlphaFunc(GLenum, GLclampf) { trapGlCall("glAlphaFunc"); }
void GLAPIENTRY glCallList(GLuint) { trapGlCall("glCallList"); }
void GLAPIENTRY glClipPlane(GLenum, const GLdouble *) { trapGlCall("glClipPlane"); }
void GLAPIENTRY glColor3dv(const GLdouble *) { trapGlCall("glColor3dv"); }
void GLAPIENTRY glColor3fv(const GLfloat *) { trapGlCall("glColor3fv"); }
void GLAPIENTRY glColor4dv(const GLdouble *) { trapGlCall("glColor4dv"); }
void GLAPIENTRY glColor4f(GLfloat, GLfloat, GLfloat, GLfloat) { trapGlCall("glColor4f"); }
void GLAPIENTRY glColor4fv(const GLfloat *) { trapGlCall("glColor4fv"); }
void GLAPIENTRY glColor4ubv(const GLubyte *) { trapGlCall("glColor4ubv"); }
void GLAPIENTRY glColorMaterial(GLenum, GLenum) { trapGlCall("glColorMaterial"); }
void GLAPIENTRY glColorPointer(GLint, GLenum, GLsizei, const GLvoid *) { trapGlCall("glColorPointer"); }
void GLAPIENTRY glDeleteLists(GLuint, GLsizei) { trapGlCall("glDeleteLists"); }
void GLAPIENTRY glDisableClientState(GLenum) { trapGlCall("glDisableClientState"); }
void GLAPIENTRY glDrawPixels(GLsizei, GLsizei, GLenum, GLenum, const GLvoid *) { trapGlCall("glDrawPixels"); }
void GLAPIENTRY glEnableClientState(GLenum) { trapGlCall("glEnableClientState"); }
void GLAPIENTRY glEndList(void) { trapGlCall("glEndList"); }
void GLAPIENTRY glFogf(GLenum, GLfloat) { trapGlCall("glFogf"); }
void GLAPIENTRY glFogfv(GLenum, const GLfloat *) { trapGlCall("glFogfv"); }
void GLAPIENTRY glFogi(GLenum, GLint) { trapGlCall("glFogi"); }
GLuint GLAPIENTRY glGenLists(GLsizei) { trapGlCall("glGenLists"); }
void GLAPIENTRY glGetLightfv(GLenum, GLenum, GLfloat *) { trapGlCall("glGetLightfv"); }
void GLAPIENTRY glGetTexImage(GLenum, GLint, GLenum, GLenum, GLvoid *) { trapGlCall("glGetTexImage"); }
void GLAPIENTRY glGetTexLevelParameteriv(GLenum, GLint, GLenum, GLint *) { trapGlCall("glGetTexLevelParameteriv"); }
void GLAPIENTRY glInterleavedArrays(GLenum, GLsizei, const GLvoid *) { trapGlCall("glInterleavedArrays"); }
void GLAPIENTRY glLightf(GLenum, GLenum, GLfloat) { trapGlCall("glLightf"); }
void GLAPIENTRY glLightfv(GLenum, GLenum, const GLfloat *) { trapGlCall("glLightfv"); }
void GLAPIENTRY glLightModelfv(GLenum, const GLfloat *) { trapGlCall("glLightModelfv"); }
void GLAPIENTRY glLightModeli(GLenum, GLint) { trapGlCall("glLightModeli"); }
void GLAPIENTRY glLineStipple(GLint, GLushort) { trapGlCall("glLineStipple"); }
void GLAPIENTRY glLoadMatrixd(const GLdouble *) { trapGlCall("glLoadMatrixd"); }
void GLAPIENTRY glLogicOp(GLenum) { trapGlCall("glLogicOp"); }
void GLAPIENTRY glMaterialf(GLenum, GLenum, GLfloat) { trapGlCall("glMaterialf"); }
void GLAPIENTRY glMaterialfv(GLenum, GLenum, const GLfloat *) { trapGlCall("glMaterialfv"); }
void GLAPIENTRY glNewList(GLuint, GLenum) { trapGlCall("glNewList"); }
void GLAPIENTRY glNormal3bv(const GLbyte *) { trapGlCall("glNormal3bv"); }
void GLAPIENTRY glNormal3dv(const GLdouble *) { trapGlCall("glNormal3dv"); }
void GLAPIENTRY glNormal3f(GLfloat, GLfloat, GLfloat) { trapGlCall("glNormal3f"); }
void GLAPIENTRY glNormal3fv(const GLfloat *) { trapGlCall("glNormal3fv"); }
void GLAPIENTRY glNormal3sv(const GLshort *) { trapGlCall("glNormal3sv"); }
void GLAPIENTRY glNormalPointer(GLenum, GLsizei, const GLvoid *) { trapGlCall("glNormalPointer"); }
void GLAPIENTRY glPointSize(GLfloat) { trapGlCall("glPointSize"); }
void GLAPIENTRY glPolygonMode(GLenum, GLenum) { trapGlCall("glPolygonMode"); }
void GLAPIENTRY glPolygonStipple(const GLubyte *) { trapGlCall("glPolygonStipple"); }
void GLAPIENTRY glRasterPos3f(GLfloat, GLfloat, GLfloat) { trapGlCall("glRasterPos3f"); }
void GLAPIENTRY glScalef(GLfloat, GLfloat, GLfloat) { trapGlCall("glScalef"); }
void GLAPIENTRY glShadeModel(GLenum) { trapGlCall("glShadeModel"); }
void GLAPIENTRY glTexCoordPointer(GLint, GLenum, GLsizei, const GLvoid *) { trapGlCall("glTexCoordPointer"); }
void GLAPIENTRY glTexEnvf(GLenum, GLenum, GLfloat) { trapGlCall("glTexEnvf"); }
void GLAPIENTRY glTexEnvfv(GLenum, GLenum, const GLfloat *) { trapGlCall("glTexEnvfv"); }
void GLAPIENTRY glTexEnvi(GLenum, GLenum, GLint) { trapGlCall("glTexEnvi"); }
void GLAPIENTRY glTexGendv(GLenum, GLenum, const GLdouble *) { trapGlCall("glTexGendv"); }
void GLAPIENTRY glTexGeni(GLenum, GLenum, GLint) { trapGlCall("glTexGeni"); }
void GLAPIENTRY glTexImage1D(GLenum, GLint, GLint, GLsizei, GLint, GLenum, GLenum, const GLvoid *) { trapGlCall("glTexImage1D"); }

}  // extern "C"
