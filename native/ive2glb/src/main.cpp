/**
 * @description ive2glb：把 OpenSceneGraph 的 IVE 场景导出为中间产物（scene.json + data.bin）。
 *              本工具只依赖 libosg / libosgDB 与 osgdb_ive、osgdb_serializers_osg 插件，
 *              不链接 Qt、Assimp 或任何渲染模块；GLB 的组装与贴图编码由 Electron 侧的
 *              src/ive.js 完成，因此这里只输出原始顶点、索引与像素缓冲。
 * @date 2026-09-17
 */

#include <osg/Array>
#include <osg/BlendFunc>
#include <osg/CullFace>
#include <osg/Geode>
#include <osg/Geometry>
#include <osg/Group>
#include <osg/Image>
#include <osg/Material>
#include <osg/MatrixTransform>
#include <osg/Node>
#include <osg/PositionAttitudeTransform>
#include <osg/PrimitiveSet>
#include <osg/StateSet>
#include <osg/Texture2D>
#include <osg/Version>
#include <osgDB/ReadFile>
#include <osgDB/Registry>

#include <algorithm>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <map>
#include <sstream>
#include <string>
#include <vector>

namespace {

constexpr const char* kGenerator = "ive2glb 1.0.0";

// ---------------------------------------------------------------- JSON 工具

std::string jsonEscape(const std::string& value) {
    std::string out;
    out.reserve(value.size() + 8);
    for (const char ch : value) {
        switch (ch) {
            case '"': out += "\\\""; break;
            case '\\': out += "\\\\"; break;
            case '\n': out += "\\n"; break;
            case '\r': out += "\\r"; break;
            case '\t': out += "\\t"; break;
            default:
                if (static_cast<unsigned char>(ch) < 0x20) {
                    char buffer[8];
                    std::snprintf(buffer, sizeof(buffer), "\\u%04x", static_cast<unsigned char>(ch));
                    out += buffer;
                } else {
                    out += ch;
                }
        }
    }
    return out;
}

std::string jsonString(const std::string& value) {
    return "\"" + jsonEscape(value) + "\"";
}

std::string jsonFloats(const float* values, unsigned count) {
    std::ostringstream stream;
    stream << '[' << std::setprecision(9);
    for (unsigned i = 0; i < count; ++i) {
        if (i != 0) stream << ',';
        stream << values[i];
    }
    stream << ']';
    return stream.str();
}

// ---------------------------------------------------------------- 二进制输出

/**
 * @description 顺序追加写入 data.bin，并保证每段起始偏移 4 字节对齐。
 */
class BinWriter {
public:
    bool open(const std::filesystem::path& path) {
        file_.open(path, std::ios::binary | std::ios::trunc);
        return file_.good();
    }

    /** @returns 本段数据在 data.bin 中的起始偏移；失败返回 UINT64_MAX。 */
    uint64_t append(const void* data, const std::size_t bytes) {
        const uint64_t offset = offset_;
        if (bytes != 0) {
            file_.write(static_cast<const char*>(data), static_cast<std::streamsize>(bytes));
            if (!file_.good()) return UINT64_MAX;
            offset_ += bytes;
        }
        const std::size_t padding = (4 - (bytes % 4)) % 4;
        if (padding != 0) {
            const char zeros[4] = {0, 0, 0, 0};
            file_.write(zeros, static_cast<std::streamsize>(padding));
            if (!file_.good()) return UINT64_MAX;
            offset_ += padding;
        }
        return offset;
    }

    uint64_t offset() const { return offset_; }

    void close() { file_.close(); }

private:
    std::ofstream file_;
    uint64_t offset_ = 0;
};

// ---------------------------------------------------------------- 数据记录

struct ImageRecord {
    std::string name;
    int width = 0;
    int height = 0;
    int depth = 1;
    unsigned pixelFormat = 0;
    unsigned dataType = 0;
    unsigned rowLength = 0;
    unsigned rowBytes = 0;
    std::string origin;
    uint64_t offset = 0;
    uint64_t length = 0;
};

struct MaterialRecord {
    std::string name;
    float diffuse[4] = {1.0f, 1.0f, 1.0f, 1.0f};
    float ambient[4] = {0.0f, 0.0f, 0.0f, 1.0f};
    float specular[4] = {0.0f, 0.0f, 0.0f, 1.0f};
    float emission[4] = {0.0f, 0.0f, 0.0f, 1.0f};
    float shininess = 0.0f;
    int baseColorImage = -1;
    std::string alphaMode = "OPAQUE";
    std::string cullFace = "absent";
};

struct AttributeRecord {
    uint64_t offset = 0;
    uint64_t length = 0;
    unsigned count = 0;
    unsigned components = 0;
    unsigned componentType = 0;
};

struct PrimitiveRecord {
    int material = -1;
    std::string mode = "TRIANGLES";
    std::map<std::string, AttributeRecord> attributes;
    AttributeRecord indices;
};

struct MeshRecord {
    std::string name;
    std::vector<PrimitiveRecord> primitives;
};

struct NodeRecord {
    std::string name;
    bool hasMatrix = false;
    float matrix[16] = {1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1};
    int mesh = -1;
    std::vector<int> children;
};

// ---------------------------------------------------------------- 类型换算

unsigned bytesPerComponent(const unsigned dataType) {
    switch (dataType) {
        case GL_BYTE:
        case GL_UNSIGNED_BYTE: return 1;
        case GL_SHORT:
        case GL_UNSIGNED_SHORT:
        case GL_HALF_FLOAT: return 2;
        case GL_INT:
        case GL_UNSIGNED_INT:
        case GL_FLOAT: return 4;
        case GL_DOUBLE: return 8;
        default: return 0;
    }
}

unsigned pixelComponentCount(const unsigned pixelFormat) {
    switch (pixelFormat) {
        case GL_RGB:
        case GL_BGR: return 3;
        case GL_RGBA:
        case GL_BGRA: return 4;
        case GL_LUMINANCE:
        case GL_ALPHA:
        case GL_RED: return 1;
        case GL_LUMINANCE_ALPHA:
        case GL_RG: return 2;
        default: return 0;
    }
}

float halfToFloat(const uint16_t value) {
    const uint32_t sign = static_cast<uint32_t>(value & 0x8000) << 16;
    uint32_t exponent = (value >> 10) & 0x1f;
    uint32_t mantissa = value & 0x03ff;
    if (exponent == 0) {
        if (mantissa == 0) return 0.0f;
        exponent = 127 - 15 + 1;
        while ((mantissa & 0x0400) == 0) {
            mantissa <<= 1;
            --exponent;
        }
        mantissa &= 0x03ff;
    } else if (exponent == 0x1f) {
        exponent = 255;
    } else {
        exponent = exponent - 15 + 127;
    }
    const uint32_t bits = sign | (exponent << 23) | (mantissa << 13);
    float result = 0.0f;
    std::memcpy(&result, &bits, sizeof(result));
    return result;
}

/**
 * @description 把任意 OSG 顶点数组按分量读取为 float32，非 float 来源在此统一换算。
 */
bool readFloatComponents(
    const osg::Array* array,
    const unsigned components,
    std::vector<float>& out,
    unsigned& count) {
    if (array == nullptr || components == 0) return false;
    count = array->getNumElements();
    if (count == 0) return false;

    out.assign(static_cast<std::size_t>(count) * components, 0.0f);
    const unsigned char* base = static_cast<const unsigned char*>(array->getDataPointer());
    if (base == nullptr) return false;

    const unsigned sourceComponents = static_cast<unsigned>(array->getDataSize());
    const unsigned sourceBytes = bytesPerComponent(array->getDataType());
    if (sourceBytes == 0) return false;

    // 常见情况：float32 且分量一致时直接整块拷贝。
    if (array->getDataType() == GL_FLOAT && sourceComponents == components) {
        std::memcpy(out.data(), base, out.size() * sizeof(float));
        return true;
    }

    for (unsigned i = 0; i < count; ++i) {
        const unsigned char* element = base + static_cast<std::size_t>(i) * sourceComponents * sourceBytes;
        for (unsigned c = 0; c < components; ++c) {
            const unsigned sourceIndex = std::min(c, sourceComponents - 1);
            const unsigned char* cell = element + static_cast<std::size_t>(sourceIndex) * sourceBytes;
            float value = 0.0f;
            switch (array->getDataType()) {
                case GL_BYTE: value = static_cast<float>(*reinterpret_cast<const int8_t*>(cell)); break;
                case GL_UNSIGNED_BYTE: value = static_cast<float>(*cell); break;
                case GL_SHORT: value = static_cast<float>(*reinterpret_cast<const int16_t*>(cell)); break;
                case GL_UNSIGNED_SHORT: value = static_cast<float>(*reinterpret_cast<const uint16_t*>(cell)); break;
                case GL_INT: value = static_cast<float>(*reinterpret_cast<const int32_t*>(cell)); break;
                case GL_UNSIGNED_INT: value = static_cast<float>(*reinterpret_cast<const uint32_t*>(cell)); break;
                case GL_FLOAT: std::memcpy(&value, cell, sizeof(float)); break;
                case GL_DOUBLE: value = static_cast<float>(*reinterpret_cast<const double*>(cell)); break;
                case GL_HALF_FLOAT: value = halfToFloat(*reinterpret_cast<const uint16_t*>(cell)); break;
                default: return false;
            }
            out[static_cast<std::size_t>(i) * components + c] = value;
        }
    }
    return true;
}

// ---------------------------------------------------------------- 图元展开

/** @description 把 QUADS/STRIP/FAN/POLYGON 等模式展开为独立三角形索引。 */
bool expandToTriangles(
    const unsigned mode,
    const uint32_t* indices,
    const std::size_t count,
    std::vector<uint32_t>& out) {
    switch (mode) {
        case GL_TRIANGLES:
            out.insert(out.end(), indices, indices + count);
            return true;
        case GL_TRIANGLE_STRIP:
            for (std::size_t i = 0; i + 2 < count; ++i) {
                if (i % 2 == 0) {
                    out.push_back(indices[i]);
                    out.push_back(indices[i + 1]);
                    out.push_back(indices[i + 2]);
                } else {
                    out.push_back(indices[i + 1]);
                    out.push_back(indices[i]);
                    out.push_back(indices[i + 2]);
                }
            }
            return true;
        case GL_TRIANGLE_FAN:
        case GL_POLYGON:
            for (std::size_t i = 1; i + 1 < count; ++i) {
                out.push_back(indices[0]);
                out.push_back(indices[i]);
                out.push_back(indices[i + 1]);
            }
            return true;
        case GL_QUADS:
        case GL_QUAD_STRIP:
            for (std::size_t i = 0; i + 3 < count; i += 4) {
                out.push_back(indices[i]);
                out.push_back(indices[i + 1]);
                out.push_back(indices[i + 2]);
                out.push_back(indices[i]);
                out.push_back(indices[i + 2]);
                out.push_back(indices[i + 3]);
            }
            return true;
        default:
            return false;
    }
}

// ---------------------------------------------------------------- 场景构建

class Builder {
public:
    std::vector<ImageRecord> images;
    std::vector<MaterialRecord> materials;
    std::vector<MeshRecord> meshes;
    std::vector<NodeRecord> nodes;
    std::vector<std::string> warnings;

    bool openBin(const std::filesystem::path& path) { return bin_.open(path); }
    uint64_t binLength() const { return bin_.offset(); }
    void closeBin() { bin_.close(); }

    void warn(const std::string& message) {
        if (std::find(warnings.begin(), warnings.end(), message) == warnings.end()) {
            warnings.push_back(message);
        }
    }

    int addNode(osg::Node* node, osg::StateSet* inherited) {
        if (node == nullptr) return -1;

        const int index = static_cast<int>(nodes.size());
        nodes.push_back(NodeRecord{});
        nodes[index].name = node->getName();

        osg::StateSet* state = node->getStateSet();
        if (!hasMaterialOrTexture(state)) state = inherited;

        if (auto* matrixTransform = dynamic_cast<osg::MatrixTransform*>(node)) {
            writeMatrix(index, matrixTransform->getMatrix());
        } else if (auto* pat = dynamic_cast<osg::PositionAttitudeTransform*>(node)) {
            osg::Matrixd matrix = osg::Matrixd::translate(pat->getPivotPoint()) *
                osg::Matrixd::rotate(pat->getAttitude()) *
                osg::Matrixd::scale(pat->getScale()) *
                osg::Matrixd::translate(-pat->getPivotPoint());
            writeMatrix(index, matrix);
        }

        if (auto* geode = node->asGeode()) {
            const int mesh = addMesh(geode, state);
            if (mesh >= 0) nodes[index].mesh = mesh;
        } else if (auto* group = node->asGroup()) {
            for (unsigned i = 0; i < group->getNumChildren(); ++i) {
                const int child = addNode(group->getChild(i), state);
                if (child >= 0) nodes[index].children.push_back(child);
            }
        } else {
            warn("跳过不支持的节点类型：" + std::string(node->className()));
        }
        return index;
    }

private:
    BinWriter bin_;
    std::map<const osg::Image*, int> imageLookup_;
    std::map<std::string, int> materialLookup_;

    static bool hasMaterialOrTexture(const osg::StateSet* state) {
        if (state == nullptr) return false;
        if (state->getAttribute(osg::StateAttribute::MATERIAL) != nullptr) return true;
        return state->getTextureAttribute(0, osg::StateAttribute::TEXTURE) != nullptr;
    }

    static void writeColor(const osg::Vec4& color, float* target) {
        target[0] = static_cast<float>(color.r());
        target[1] = static_cast<float>(color.g());
        target[2] = static_cast<float>(color.b());
        target[3] = static_cast<float>(color.a());
    }

    void writeMatrix(const int index, const osg::Matrixd& matrix) {
        const bool identity = matrix == osg::Matrixd::identity();
        if (identity) return;
        // OSG 与 glTF 都使用列主序，可以直接按内存顺序输出。
        const double* values = matrix.ptr();
        for (int i = 0; i < 16; ++i) nodes[index].matrix[i] = static_cast<float>(values[i]);
        nodes[index].hasMatrix = true;
    }

    int addMesh(osg::Geode* geode, osg::StateSet* inherited) {
        MeshRecord mesh;
        mesh.name = geode->getName();
        for (unsigned i = 0; i < geode->getNumDrawables(); ++i) {
            osg::Drawable* drawable = geode->getDrawable(i);
            auto* geometry = drawable->asGeometry();
            if (geometry == nullptr) {
                warn("跳过非 Geometry 的绘制对象：" + std::string(drawable->className()));
                continue;
            }
            osg::StateSet* state = drawable->getStateSet();
            if (!hasMaterialOrTexture(state)) state = inherited;
            PrimitiveRecord primitive;
            if (addPrimitive(geometry, state, primitive) && !primitive.attributes.empty()) {
                if (mesh.name.empty()) mesh.name = drawable->getName();
                mesh.primitives.push_back(primitive);
            }
        }
        if (mesh.primitives.empty()) return -1;
        meshes.push_back(mesh);
        return static_cast<int>(meshes.size()) - 1;
    }

    bool addPrimitive(osg::Geometry* geometry, osg::StateSet* state, PrimitiveRecord& primitive) {
        const osg::Array* vertexArray = geometry->getVertexArray();
        if (vertexArray == nullptr || vertexArray->getNumElements() == 0) {
            warn("跳过没有顶点数据的 Geometry");
            return false;
        }
        const unsigned vertexCount = vertexArray->getNumElements();

        if (!addAttribute("POSITION", vertexArray, 3, vertexCount, primitive)) return false;

        const osg::Array* normalArray = geometry->getNormalArray();
        if (normalArray != nullptr && normalArray->getNumElements() == vertexCount) {
            addAttribute("NORMAL", normalArray, 3, vertexCount, primitive);
        }

        for (unsigned unit = 0; unit < geometry->getNumTexCoordArrays(); ++unit) {
            const osg::Array* texCoordArray = geometry->getTexCoordArray(unit);
            if (texCoordArray == nullptr || texCoordArray->getNumElements() != vertexCount) continue;
            addAttribute("TEXCOORD_" + std::to_string(unit), texCoordArray, 2, vertexCount, primitive);
        }

        std::vector<uint32_t> triangles;
        for (unsigned i = 0; i < geometry->getNumPrimitiveSets(); ++i) {
            collectTriangles(geometry->getPrimitiveSet(i), vertexCount, triangles);
        }
        if (triangles.empty()) {
            warn("跳过没有可用三角面的 Geometry");
            return false;
        }

        const uint64_t offset = bin_.append(triangles.data(), triangles.size() * sizeof(uint32_t));
        if (offset == UINT64_MAX) return false;
        primitive.indices.offset = offset;
        primitive.indices.length = triangles.size() * sizeof(uint32_t);
        primitive.indices.count = static_cast<unsigned>(triangles.size());
        primitive.indices.components = 1;
        primitive.indices.componentType = GL_UNSIGNED_INT;
        primitive.material = addMaterial(state);
        return true;
    }

    bool addAttribute(
        const std::string& name,
        const osg::Array* array,
        const unsigned components,
        const unsigned vertexCount,
        PrimitiveRecord& primitive) {
        std::vector<float> values;
        unsigned count = 0;
        if (!readFloatComponents(array, components, values, count) || count != vertexCount) {
            warn("跳过无法转换的顶点属性：" + name);
            return false;
        }
        const uint64_t offset = bin_.append(values.data(), values.size() * sizeof(float));
        if (offset == UINT64_MAX) return false;
        AttributeRecord record;
        record.offset = offset;
        record.length = values.size() * sizeof(float);
        record.count = count;
        record.components = components;
        record.componentType = GL_FLOAT;
        primitive.attributes[name] = record;
        return true;
    }

    void collectTriangles(const osg::PrimitiveSet* set, const unsigned vertexCount, std::vector<uint32_t>& out) {
        if (set == nullptr) return;
        const unsigned mode = set->getMode();
        std::vector<uint32_t> indices;
        switch (set->getType()) {
            case osg::PrimitiveSet::DrawElementsUBytePrimitiveType: {
                const auto* elements = static_cast<const osg::DrawElementsUByte*>(set);
                indices.assign(elements->begin(), elements->end());
                break;
            }
            case osg::PrimitiveSet::DrawElementsUShortPrimitiveType: {
                const auto* elements = static_cast<const osg::DrawElementsUShort*>(set);
                indices.assign(elements->begin(), elements->end());
                break;
            }
            case osg::PrimitiveSet::DrawElementsUIntPrimitiveType: {
                const auto* elements = static_cast<const osg::DrawElementsUInt*>(set);
                indices.assign(elements->begin(), elements->end());
                break;
            }
            case osg::PrimitiveSet::DrawArraysPrimitiveType: {
                const auto* arrays = static_cast<const osg::DrawArrays*>(set);
                if (arrays->getCount() == 0) return;
                indices.resize(arrays->getCount());
                for (unsigned i = 0; i < arrays->getCount(); ++i) indices[i] = arrays->getFirst() + i;
                break;
            }
            default:
                warn("跳过不支持的图元集合类型：" + std::to_string(set->getType()));
                return;
        }
        if (indices.empty()) return;
        for (const uint32_t value : indices) {
            if (value >= vertexCount) {
                warn("跳过索引越界的图元集合");
                return;
            }
        }
        if (!expandToTriangles(mode, indices.data(), indices.size(), out)) {
            warn("跳过非三角面图元模式：" + std::to_string(mode));
        }
    }

    int addImage(osg::Image* image) {
        const auto found = imageLookup_.find(image);
        if (found != imageLookup_.end()) return found->second;

        if (image->isCompressed()) {
            warn("跳过压缩格式的内嵌贴图：" + image->getFileName());
            return -1;
        }
        const unsigned componentCount = pixelComponentCount(image->getPixelFormat());
        const unsigned componentBytes = bytesPerComponent(image->getDataType());
        if (componentCount == 0 || componentBytes == 0 || image->data() == nullptr) {
            warn("跳过无法识别的内嵌贴图：" + image->getFileName());
            return -1;
        }

        ImageRecord record;
        record.name = image->getFileName();
        record.width = image->s();
        record.height = image->t();
        record.depth = image->r();
        record.pixelFormat = image->getPixelFormat();
        record.dataType = image->getDataType();
        record.rowLength = static_cast<unsigned>(std::max(0, image->getRowLength()));
        const unsigned pixelsPerRow = record.rowLength != 0 ? record.rowLength : static_cast<unsigned>(record.width);
        record.rowBytes = pixelsPerRow * componentCount * componentBytes;
        record.origin = image->getOrigin() == osg::Image::TOP_LEFT ? "TOP_LEFT" : "BOTTOM_LEFT";

        const std::size_t bytes = static_cast<std::size_t>(record.rowBytes) *
            static_cast<std::size_t>(record.height) * static_cast<std::size_t>(std::max(1, record.depth));
        const uint64_t offset = bin_.append(image->data(), bytes);
        if (offset == UINT64_MAX) return -1;
        record.offset = offset;
        record.length = bytes;

        images.push_back(record);
        const int index = static_cast<int>(images.size()) - 1;
        imageLookup_[image] = index;
        return index;
    }

    int addMaterial(osg::StateSet* state) {
        MaterialRecord record;
        bool hasMaterial = false;

        if (state != nullptr) {
            auto* material = dynamic_cast<osg::Material*>(state->getAttribute(osg::StateAttribute::MATERIAL));
            if (material != nullptr) {
                hasMaterial = true;
                record.name = material->getName();
                writeColor(material->getDiffuse(osg::Material::FRONT_AND_BACK), record.diffuse);
                writeColor(material->getAmbient(osg::Material::FRONT_AND_BACK), record.ambient);
                writeColor(material->getSpecular(osg::Material::FRONT_AND_BACK), record.specular);
                writeColor(material->getEmission(osg::Material::FRONT_AND_BACK), record.emission);
                record.shininess = material->getShininess(osg::Material::FRONT_AND_BACK);
            }

            auto* texture = dynamic_cast<osg::Texture2D*>(state->getTextureAttribute(0, osg::StateAttribute::TEXTURE));
            if (texture != nullptr && texture->getImage() != nullptr) {
                record.baseColorImage = addImage(texture->getImage());
                hasMaterial = true;
            }

            const int hint = state->getRenderingHint();
            if (state->getAttribute(osg::StateAttribute::BLENDFUNC) != nullptr ||
                hint == osg::StateSet::TRANSPARENT_BIN) {
                record.alphaMode = "BLEND";
            }

            if (auto* cullFace = dynamic_cast<osg::CullFace*>(state->getAttribute(osg::StateAttribute::CULLFACE))) {
                switch (cullFace->getMode()) {
                    case GL_FRONT: record.cullFace = "front"; break;
                    case GL_FRONT_AND_BACK: record.cullFace = "both"; break;
                    default: record.cullFace = "back"; break;
                }
            }
        }

        if (!hasMaterial) return -1;

        std::ostringstream key;
        key << record.baseColorImage << '|' << record.diffuse[0] << ',' << record.diffuse[1] << ','
            << record.diffuse[2] << ',' << record.diffuse[3] << '|' << record.alphaMode << '|' << record.cullFace;
        const auto found = materialLookup_.find(key.str());
        if (found != materialLookup_.end()) return found->second;

        materials.push_back(record);
        const int index = static_cast<int>(materials.size()) - 1;
        materialLookup_[key.str()] = index;
        return index;
    }
};

// ---------------------------------------------------------------- 输出

std::string buildSceneJson(const Builder& builder, const std::string& sourceName) {
    std::ostringstream out;
    out << std::setprecision(9);
    out << "{\n";
    out << "  \"generator\": " << jsonString(kGenerator) << ",\n";
    out << "  \"osgVersion\": " << jsonString(osgGetVersion() != nullptr ? osgGetVersion() : "") << ",\n";
    out << "  \"source\": " << jsonString(sourceName) << ",\n";
    out << "  \"bin\": \"data.bin\",\n";
    out << "  \"binLength\": " << builder.binLength() << ",\n";

    out << "  \"warnings\": [";
    for (std::size_t i = 0; i < builder.warnings.size(); ++i) {
        if (i != 0) out << ", ";
        out << jsonString(builder.warnings[i]);
    }
    out << "],\n";

    out << "  \"images\": [";
    for (std::size_t i = 0; i < builder.images.size(); ++i) {
        const ImageRecord& image = builder.images[i];
        if (i != 0) out << ",";
        out << "\n    {\"name\": " << jsonString(image.name)
            << ", \"width\": " << image.width
            << ", \"height\": " << image.height
            << ", \"depth\": " << image.depth
            << ", \"pixelFormat\": " << image.pixelFormat
            << ", \"dataType\": " << image.dataType
            << ", \"rowLength\": " << image.rowLength
            << ", \"rowBytes\": " << image.rowBytes
            << ", \"origin\": " << jsonString(image.origin)
            << ", \"offset\": " << image.offset
            << ", \"length\": " << image.length << "}";
    }
    out << (builder.images.empty() ? "]," : "\n  ],") << "\n";

    out << "  \"materials\": [";
    for (std::size_t i = 0; i < builder.materials.size(); ++i) {
        const MaterialRecord& material = builder.materials[i];
        if (i != 0) out << ",";
        out << "\n    {\"name\": " << jsonString(material.name)
            << ", \"diffuse\": " << jsonFloats(material.diffuse, 4)
            << ", \"ambient\": " << jsonFloats(material.ambient, 4)
            << ", \"specular\": " << jsonFloats(material.specular, 4)
            << ", \"emission\": " << jsonFloats(material.emission, 4)
            << ", \"shininess\": " << material.shininess
            << ", \"baseColorImage\": " << material.baseColorImage
            << ", \"alphaMode\": " << jsonString(material.alphaMode)
            << ", \"cullFace\": " << jsonString(material.cullFace) << "}";
    }
    out << (builder.materials.empty() ? "]," : "\n  ],") << "\n";

    out << "  \"meshes\": [";
    for (std::size_t i = 0; i < builder.meshes.size(); ++i) {
        const MeshRecord& mesh = builder.meshes[i];
        if (i != 0) out << ",";
        out << "\n    {\"name\": " << jsonString(mesh.name) << ", \"primitives\": [";
        for (std::size_t p = 0; p < mesh.primitives.size(); ++p) {
            const PrimitiveRecord& primitive = mesh.primitives[p];
            if (p != 0) out << ",";
            out << "\n      {\"material\": " << primitive.material
                << ", \"mode\": " << jsonString(primitive.mode) << ", \"attributes\": {";
            bool first = true;
            for (const auto& [name, attribute] : primitive.attributes) {
                if (!first) out << ", ";
                first = false;
                out << jsonString(name) << ": {\"offset\": " << attribute.offset
                    << ", \"length\": " << attribute.length
                    << ", \"count\": " << attribute.count
                    << ", \"components\": " << attribute.components
                    << ", \"componentType\": " << attribute.componentType << "}";
            }
            out << "}, \"indices\": {\"offset\": " << primitive.indices.offset
                << ", \"length\": " << primitive.indices.length
                << ", \"count\": " << primitive.indices.count
                << ", \"components\": 1"
                << ", \"componentType\": " << primitive.indices.componentType << "}}";
        }
        out << "]}";
    }
    out << (builder.meshes.empty() ? "]," : "\n  ],") << "\n";

    out << "  \"nodes\": [";
    for (std::size_t i = 0; i < builder.nodes.size(); ++i) {
        const NodeRecord& node = builder.nodes[i];
        if (i != 0) out << ",";
        out << "\n    {\"name\": " << jsonString(node.name);
        if (node.hasMatrix) out << ", \"matrix\": " << jsonFloats(node.matrix, 16);
        out << ", \"mesh\": " << node.mesh << ", \"children\": [";
        for (std::size_t c = 0; c < node.children.size(); ++c) {
            if (c != 0) out << ", ";
            out << node.children[c];
        }
        out << "]}";
    }
    out << (builder.nodes.empty() ? "]," : "\n  ],") << "\n";

    out << "  \"scenes\": [{\"nodes\": [" << (builder.nodes.empty() ? "" : "0") << "]}]\n";
    out << "}\n";
    return out.str();
}

void writeJsonSummary(const std::string& status, const std::string& message, const Builder* builder) {
    std::ostringstream out;
    out << "{\"status\": " << jsonString(status)
        << ", \"error\": " << jsonString(message);
    if (builder != nullptr) {
        out << ", \"images\": " << builder->images.size()
            << ", \"materials\": " << builder->materials.size()
            << ", \"meshes\": " << builder->meshes.size()
            << ", \"nodes\": " << builder->nodes.size()
            << ", \"warnings\": " << builder->warnings.size()
            << ", \"binBytes\": " << builder->binLength();
    }
    out << "}";
    std::cout << out.str() << std::endl;
}

/**
 * @description 打包后插件与可执行文件同目录，需要把自带的 osgPlugins 目录插到搜索列表最前面，
 *   否则 OSG 会优先命中编译期内置的插件路径（例如开发机上的 Homebrew 安装）。
 */
void registerLocalPluginPath(const char* executable) {
    std::error_code error;
    const auto directory = std::filesystem::absolute(executable, error).parent_path();
    if (error) return;
    for (const char* name : {"osgPlugins", "osgPlugins-3.6.5"}) {
        const auto candidate = directory / name;
        if (!std::filesystem::is_directory(candidate, error)) continue;
        auto& library = osgDB::Registry::instance()->getLibraryFilePathList();
        if (std::find(library.begin(), library.end(), candidate.string()) != library.end()) continue;
        library.insert(library.begin(), candidate.string());
    }
}

void printUsage() {
    std::cerr << "用法：ive2glb <input.ive> <output-dir>\n"
              << "  将 IVE 场景导出为 <output-dir>/scene.json 与 <output-dir>/data.bin。\n";
}

}  // namespace

int main(int argc, char* argv[]) {
    if (argc != 3) {
        printUsage();
        writeJsonSummary("error", "参数数量不正确", nullptr);
        return 2;
    }

    registerLocalPluginPath(argv[0]);

    const std::filesystem::path inputPath = argv[1];
    const std::filesystem::path outputDir = argv[2];
    const std::string sourceName = inputPath.filename().string();

    std::error_code error;
    if (!std::filesystem::is_regular_file(inputPath, error)) {
        writeJsonSummary("error", "源文件不存在或不可读", nullptr);
        return 1;
    }
    if (!inputPath.extension().empty() &&
        inputPath.extension().string() != ".ive" && inputPath.extension().string() != ".IVE") {
        writeJsonSummary("error", "仅支持 IVE 源文件", nullptr);
        return 1;
    }
    std::filesystem::create_directories(outputDir, error);
    if (error) {
        writeJsonSummary("error", "无法创建输出目录", nullptr);
        return 1;
    }

    osg::ref_ptr<osg::Node> root = osgDB::readRefNodeFile(inputPath.string());
    if (root == nullptr) {
        writeJsonSummary("error", "OpenSceneGraph 无法读取该 IVE 文件", nullptr);
        return 1;
    }

    Builder builder;
    if (!builder.openBin(outputDir / "data.bin")) {
        writeJsonSummary("error", "无法写入 data.bin", nullptr);
        return 1;
    }

    std::string failure;
    try {
        builder.addNode(root.get(), nullptr);
    } catch (const std::exception& exception) {
        failure = exception.what();
    } catch (...) {
        failure = "遍历场景时发生未知错误";
    }
    builder.closeBin();

    if (!failure.empty()) {
        writeJsonSummary("error", failure, nullptr);
        return 1;
    }
    if (builder.nodes.empty() || builder.meshes.empty()) {
        writeJsonSummary("error", "该 IVE 未包含可用的三角网格", &builder);
        return 1;
    }

    std::ofstream sceneFile(outputDir / "scene.json", std::ios::binary | std::ios::trunc);
    if (!sceneFile.good()) {
        writeJsonSummary("error", "无法写入 scene.json", nullptr);
        return 1;
    }
    sceneFile << buildSceneJson(builder, sourceName);
    sceneFile.close();

    writeJsonSummary("success", "", &builder);
    return 0;
}
