import java.io.File;
import javax.xml.XMLConstants;
import javax.xml.transform.stream.StreamSource;
import javax.xml.validation.SchemaFactory;
import javax.xml.validation.Validator;
import org.xml.sax.SAXException;

public final class BmpSchemaValidator {
  public static void main(String[] args) throws Exception {
    if (args.length != 2) {
      System.err.println("Usage: BmpSchemaValidator <xsd> <xml>");
      System.exit(2);
    }

    final File xsdFile = new File(args[0]);
    final File xmlFile = new File(args[1]);

    try {
      final SchemaFactory factory = SchemaFactory.newInstance(XMLConstants.W3C_XML_SCHEMA_NS_URI);
      final Validator validator = factory.newSchema(xsdFile).newValidator();
      validator.validate(new StreamSource(xmlFile));
      System.out.println(xmlFile.getAbsolutePath() + " validates against " + xsdFile.getAbsolutePath());
    } catch (SAXException error) {
      System.err.println(error.getMessage());
      System.exit(1);
    }
  }
}
